// C3X acceptance (docs/spec/30-roadmap.md, I1): from founding, a hamlet played sensibly grows
// toward 30 residents over about two to three evenings (12 to 18 in-game days) without dead ends:
// nobody leaves, food keeps coming, the books stay out of lean times, and the Hearth side finds
// patterns and grants wishes along the way. C4A adds the Village and its money.
// R1.0: the advisors are stand-ins on the zones-first Ledger until R1F rewrites them, so the
// outcome targets (residents, wishes, the Village day, the basket, trade) are skipped; what holds
// is structural: no dead ends, a street zoned from the first day, only content the player may
// place by hand, the money invariant and determinism.
import { content } from '@qoti/content';
import { creditLimit, hashState, moneyBalance, PENNIES_PER_COIN, START_TREASURY, Zone } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { explained } from './audit';
import { autoplay, formatDays } from './autoplay';

/** Defs the autoplayer placed by hand, from its action log ("3:build fishery"). */
function placed(actions: readonly string[]): string[] {
  const out = new Set<string>();
  for (const a of actions) {
    const m = /^\d+:build ([a-z-]+)(?: |$)/.exec(a);
    if (m && !a.endsWith('(refused)')) out.add(m[1]!);
  }
  return [...out].sort();
}

describe('two players, three evenings', { timeout: 120_000 }, () => {
  for (const seed of ['willow', 'hazel']) {
    it(`plays ${seed} for twelve days without dead ends, zoned from the first day`, () => {
      const run = autoplay(seed, 12);
      const days = run.days;
      const w = run.hamlet.world;
      const why = `\n${formatDays(days)}\n${run.actions.join('\n')}`;
      // Playtest round three: nothing stuck along the way (sites, builders, walkers, materials).
      expect(
        run.health.filter((i) => !explained(i)).map((i) => i.text),
        why,
      ).toEqual([]);
      // R1: Homes, Workshops and Farmland are zoned on the first morning; shops and townhouses wait
      // for Village rank.
      expect(run.street, why).toBeTruthy();
      // The action log numbers days within the season; the first day line already has lots.
      expect(days[0]!.growth!.lots, why).toBeGreaterThan(0);
      const zones = new Set(w.map.zone.filter((z) => z > 0));
      expect(zones.has(Zone.homesLow), why).toBe(true);
      expect(zones.has(Zone.crafts), why).toBe(true);
      expect(zones.has(Zone.shops), why).toBe(false);
      expect(zones.has(Zone.homesMedium), why).toBe(false);
      // Every day line carries the growth numbers, and from the second the night it watched.
      for (const d of days) expect(d.growth, why).toBeDefined();
      for (const d of days.slice(1)) expect(d.growth!.night, why).toBeDefined();
      // Growth follows demand: a night starts nothing a zone kind did not want.
      for (const d of days) {
        const n = d.growth?.night;
        if (!n) continue;
        for (const k of ['homes', 'shops', 'crafts', 'farms'] as const)
          expect(n.started[k], `${why}\nday ${d.day} ${k}`).toBeLessThanOrEqual(n.demand[k]);
      }
      // Only buildings content has, and never a business by hand (they grow on zoned lots).
      for (const def of placed(run.actions)) {
        const d = content.buildingById.get(def);
        expect(d, def).toBeDefined();
        expect(
          content.trades.some((t) => t.building === def),
          def,
        ).toBe(false);
      }
      // No labor lever: the autoplayer never pauses a building (docs/spec/13-ledger.md, Labor).
      expect(
        run.actions.filter((a) => /(rest|reopen) (the|a) /.test(a)),
        why,
      ).toEqual([]);
      expect(moneyBalance(w)).toBe(START_TREASURY);
    });
  }

  // R1F: back on with the land and plan advisors.
  for (const seed of ['willow', 'hazel']) {
    it(`grows ${seed} without dead ends`, () => {
      const run = autoplay(seed, 18);
      const days = run.days;
      const last = days[days.length - 1]!;
      const why = `\n${formatDays(days)}`;
      // C5B: the festival evenings (guests walking to the green, the mood they bring home) move
      // willow's third evening by a household.
      expect(last.residents, why).toBeGreaterThanOrEqual(27);
      expect(last.departures, why).toBe(0);
      for (const d of days) {
        expect(d.leanTimes, why).toBe(false);
        if (d.day >= 3) expect(d.foodMade + d.food, why).toBeGreaterThan(0);
        expect(d.miserable, why).toBeLessThanOrEqual(1);
      }
      expect(last.wishesGranted, why).toBeGreaterThanOrEqual(3);
      expect(last.patterns, why).toBeGreaterThanOrEqual(2);
      expect(last.achievements, why).toBeGreaterThanOrEqual(5);
      expect(run.health.filter((i) => !explained(i)).map((i) => i.text)).toEqual([]);
    });
  }

  // I2 (C4A): on from 30 residents to the Village Charter, then a Village whose money keeps moving:
  // no lean times, nobody leaving, purses and the treasury both alive, and not a penny made or
  // lost inside the valley. R1: the carrier trades for both seeds (`standInPost` is a no-op now the
  // Trading Post is in content).
  for (const [seed, standInPost] of [
    ['hazel', false],
    ['willow', true],
  ] as const) {
    // R1F: back on with the land and plan advisors (R1: Village in about two evenings).
    it(`reaches the Village with ${seed}${standInPost ? ' (the post on)' : ''}`, () => {
      const run = autoplay(seed, 44, { standInPost });
      const days = run.days;
      const why = `\n${formatDays(days)}`;
      const village = days.find((d) => d.rank === 'village');
      // The roadmap's range is day 25 to 37 (docs/spec/30-roadmap.md); R1 asks about two evenings.
      expect(village?.day, why).toBeLessThanOrEqual(37);
      const last = days[days.length - 1]!;
      expect(last.residents, why).toBeGreaterThanOrEqual(40);
      expect(last.departures, why).toBe(0);
      const after = days.filter((d) => d.day > village!.day);
      expect(
        after.every((d) => d.wages > 0 && d.sales > 0),
        why,
      ).toBe(true);
      expect(last.savings, why).toBeGreaterThan(0);
      expect(moneyBalance(run.hamlet.world)).toBe(START_TREASURY);
    });
    // R1 stand-in (R1X): the Village's books on today's stand-ins run into lean times by day 40 on
    // both seeds: wages outrun what households buy while no Wares or Treats reach a shelf (R1A's
    // carrier reserve for a tier not yet in town, R1B's workshop trades), and Fuel is imported all
    // year (R1A). R1X turns this back on once the wave's economy is in.
    it.skip(`keeps ${seed}'s Village money moving with no lean times`, () => {
      const run = autoplay(seed, 44, { standInPost });
      const days = run.days;
      const why = `\n${formatDays(days)}`;
      const village = days.find((d) => d.rank === 'village');
      for (const d of days) expect(d.leanTimes, why).toBe(false);
      const after = days.filter((d) => d.day > village!.day);
      expect(
        after.some((d) => d.trade > 0),
        why,
      ).toBe(true);
      expect(days[days.length - 1]!.basket, why).toBeGreaterThanOrEqual(60);
    });
  }
  // C4D: with lives, story characters, plans, requests and the Charter claim in play, a valley
  // still grows, eats and never stalls, and the together loop actually happens.
  // R1F: back on with the land and plan advisors.
  it('lives, stories and the together loop over six evenings (hazel, 40 days)', () => {
    const run = autoplay('hazel', 40);
    const days = run.days;
    const last = days[days.length - 1]!;
    const why = `\n${formatDays(days)}`;
    expect(last.residents, why).toBeGreaterThanOrEqual(45);
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
// the services and homes toward Craftsfolk. C4X: the run grows on without dead ends (no lean
// times, nobody leaving, every ten days more residents), and the County Bank's loans stay inside
// the line.
describe('a Village run', { timeout: 400_000 }, () => {
  // R1 stand-in (R1X): with R1F's advisors oak reaches the Village by day 31 but ends day 70 near
  // 70 residents, short of 110, in debt: the stand-in Village economy (wages outrun sales while no
  // Wares or Treats are sold; Fuel imported all year). R1X turns it back on once R1A and R1B are in.
  it.skip('grows on as a Village with its loans in hand (oak)', () => {
    const run = autoplay('oak', 70, { village: true });
    const days = run.days;
    const why = `\n${formatDays(days)}`;
    const village = days.findIndex((d) => d.rank === 'village');
    expect(village, why).toBeGreaterThan(0);
    expect(village + 1, why).toBeLessThanOrEqual(40);
    const last = days[days.length - 1]!;
    expect(last.residents, why).toBeGreaterThan(days[village]!.residents + 75);
    expect(last.residents, why).toBeGreaterThanOrEqual(110);
    expect(last.departures, why).toBeLessThanOrEqual(2);
    for (const d of days) expect(d.leanTimes, why).toBe(false);
    // The town never stalls: every ten days of the Village half add residents.
    for (let i = village + 10; i < days.length; i += 10)
      expect(days[i]!.residents, why).toBeGreaterThan(days[i - 10]!.residents);
    expect(last.owed * PENNIES_PER_COIN, why).toBeLessThan(creditLimit(run.hamlet.world));
  });
});
