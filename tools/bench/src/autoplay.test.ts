// C3X acceptance (docs/spec/30-roadmap.md, I1): from founding, a hamlet played sensibly grows
// toward 30 residents over about two to three evenings (12 to 18 in-game days) without dead ends:
// nobody leaves, food keeps coming, the books stay out of lean times, and the Hearth side finds
// patterns and grants wishes along the way. C4A adds the Village and its money.
import { hashState, moneyBalance, START_TREASURY } from '@qoti/sim';
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
      // Playtest round three: nothing stuck along the way (sites, builders, walkers, materials).
      expect(run.health.map((i) => i.text)).toEqual([]);
    });
  }

  // I2 (C4A): on from 30 residents to the Village Charter, then a Village whose money keeps moving:
  // no lean times, nobody leaving, purses and the treasury both alive, and not a penny made or
  // lost inside the valley. One seed trades through the peddler, the other through a stand-in
  // Trading Post (until C4C's lands).
  for (const [seed, standInPost] of [
    ['hazel', false],
    ['willow', true],
  ] as const) {
    it(`reaches the Village with ${seed} and keeps its money moving${standInPost ? ' through the post' : ''}`, () => {
      const run = autoplay(seed, 44, { standInPost });
      const days = run.days;
      const why = `\n${formatDays(days)}`;
      const village = days.find((d) => d.rank === 'village');
      // The roadmap's range is day 25 to 37 (docs/spec/30-roadmap.md); playtest round three's faster
      // building moved hazel from 36 to 37 (it grows bigger sooner and waits on a season in surplus).
      expect(village?.day, why).toBeLessThanOrEqual(37);
      const last = days[days.length - 1]!;
      expect(last.residents, why).toBeGreaterThanOrEqual(40);
      expect(last.departures, why).toBe(0);
      for (const d of days) expect(d.leanTimes, why).toBe(false);
      const after = days.filter((d) => d.day > village!.day);
      expect(
        after.every((d) => d.wages > 0 && d.sales > 0),
        why,
      ).toBe(true);
      expect(
        after.some((d) => d.trade > 0),
        why,
      ).toBe(true);
      expect(last.savings, why).toBeGreaterThan(0);
      expect(last.basket, why).toBeGreaterThanOrEqual(60);
      expect(moneyBalance(run.hamlet.world)).toBe(START_TREASURY);
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

// C4C: the Village run. From the same start, the players claim the Village Charter, then build
// the chains, services and homes toward Craftsfolk. C4X: the run grows on without dead ends (no
// lean times, nobody leaving, every ten days more residents), and the County Bank's loans peak and
// come down again. Craftsfolk are not asserted: the autoplayer raises a handful at times (0 to 14
// at their peak across five seeds), well short of the 40 the tuning brief aimed for, because a Village
// of 150 to 220 has its hands in food, porters and builders (see docs/spec/13-ledger.md, C4X).
// Playtest round five: families every two hours and longer building days make a town of ~250 by
// day 60, so the run is 70 days (Village by about day 30) and a bigger town takes longer to play.
describe('a Village run', { timeout: 400_000 }, () => {
  it('grows on as a Village with its loans in hand (oak)', () => {
    const run = autoplay('oak', 70, { village: true });
    const days = run.days;
    const why = `\n${formatDays(days)}`;
    const village = days.findIndex((d) => d.rank === 'village');
    expect(village, why).toBeGreaterThan(0);
    expect(village + 1, why).toBeLessThanOrEqual(40);
    const last = days[days.length - 1]!;
    expect(last.residents, why).toBeGreaterThan(days[village]!.residents + 100);
    expect(last.departures, why).toBeLessThanOrEqual(2);
    for (const d of days) expect(d.leanTimes, why).toBe(false);
    // The town never stalls: every ten days of the Village half add residents.
    for (let i = village + 10; i < days.length; i += 10)
      expect(days[i]!.residents, why).toBeGreaterThan(days[i - 10]!.residents);
    // Loans peak and come down while the town keeps growing.
    const peak = Math.max(...days.map((d) => d.owed));
    expect(last.owed, why).toBeLessThan(peak);
  });
});
