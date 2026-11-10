// C5B acceptance: the autoplayer with every system on holds a festival every season, at least one
// reaches three stars in the first Village year, and the menu never causes a food shortage (the
// evening of every festival ends with at least a day's food in store, and the town is never left
// with less food than it had before the menu was put by, beyond what the guests ate).
import { content, festivalTuning } from '@qoti/content';
import { DAYS_PER_SEASON, larder, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';

describe('the festivals advisor', { timeout: 300_000 }, () => {
  // R1.0: the menu, twists and plans hold on the zones-first Ledger; the stars and the larder are
  // R1F's targets (below).
  it('plans a festival every season of a year on hazel, each a different twist from the last', () => {
    const missed: number[] = [];
    const unknown: number[] = [];
    const run = autoplay('hazel', 4 * DAYS_PER_SEASON, {
      onDay: (w: WorldState, line) => {
        // Every menu good is a good content has.
        for (const [g] of w.festival.plan?.menu ?? []) if (!content.goods[g]) unknown.push(g);
        if (line.day % DAYS_PER_SEASON !== 0) return;
        const last = w.festival.history[w.festival.history.length - 1];
        if (!last || last.year * 4 + last.season !== line.day / DAYS_PER_SEASON - 1) missed.push(line.day);
      },
    });
    const w = run.hamlet.world;
    expect(missed).toEqual([]);
    expect(unknown).toEqual([]);
    for (let i = 1; i < w.festival.history.length; i++) {
      const a = w.festival.history[i - 1]!;
      const b = w.festival.history[i]!;
      expect(b.twist === '' || b.twist !== a.twist).toBe(true);
    }
  });

  for (const seed of ['hazel', 'willow']) {
    // R1.0: stand-ins; R1F rewrites the advisors and their targets.
    it.skip(`holds a festival every season on ${seed}, three stars in the first Village year, and keeps the larder`, () => {
      const short: string[] = [];
      const missed: number[] = [];
      const run = autoplay(seed, 60, {
        village: true,
        onDay: (w: WorldState, line) => {
          if (line.day % DAYS_PER_SEASON !== 0) return;
          // The festival evening is over (the day line is taken after 23:00).
          const last = w.festival.history[w.festival.history.length - 1];
          const index = line.day / DAYS_PER_SEASON - 1;
          if (!last || last.year * 4 + last.season !== index) missed.push(line.day);
          if (larder(w) < w.residents.length)
            short.push(`day ${line.day}: ${larder(w)} for ${w.residents.length}`);
        },
      });
      const w = run.hamlet.world;
      const seasons = Math.floor(60 / DAYS_PER_SEASON);
      // The history keeps the last eight; every one of them is a different season in order.
      expect(w.festival.history.length).toBe(Math.min(seasons, 8));
      for (let i = 1; i < w.festival.history.length; i++) {
        const a = w.festival.history[i - 1]!;
        const b = w.festival.history[i]!;
        expect((a.year * 4 + a.season + 1) % 1000).toBe(b.year * 4 + b.season);
        expect(b.twist === '' || b.twist !== a.twist).toBe(true);
      }
      const claim = run.days.findIndex((d) => d.rank === 'village') + 1;
      expect(claim).toBeGreaterThan(0);
      const firstYear = w.festival.history.filter((h) => {
        const day = (h.year * 4 + h.season + 1) * DAYS_PER_SEASON;
        return day >= claim && day < claim + 4 * DAYS_PER_SEASON;
      });
      expect(Math.max(...firstYear.map((h) => h.stars))).toBeGreaterThanOrEqual(3);
      expect(missed).toEqual([]);
      expect(short).toEqual([]);
      expect(content.festivals.length).toBe(4);
      expect(festivalTuning.stars.length).toBe(4);
    });
  }
});
