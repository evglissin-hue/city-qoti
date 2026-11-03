// C4B acceptance (docs/build/cycle-04b-growth.md): from a hamlet the autoplayer has grown, the
// valley becomes a Village, the Ledger lays and zones a high street, and over the next days
// the zoned frontage grows homes and shops by itself, never starting what the night did not want,
// while the town keeps eating, never runs into lean times and nobody leaves.
// C4X: on the real Village run (the Charter claimed, the Village player at work) rather than a
// Village granted on day 12, which C4C's content left with nothing to grow: storehouses and stalls
// reach every door of a dozen households, and crafts grow only for a shortage a grown workshop can
// answer (firewood, yarn, cloth, cider or cheese), which no young Village has yet. Fifteen days,
// not ten: the far end of the street waits for its storehouse before porters can bring planks.
import { DAYS_PER_SEASON, hashState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay, formatDays } from './autoplay';
import { frontageAscii, streetRect } from './village';

const VILLAGE_DAY = 12;

describe('a Village grows its high street', { timeout: 180_000 }, () => {
  for (const seed of ['willow', 'hazel']) {
    it(`grows homes and shops on ${seed}'s zoned frontage in fifteen days`, () => {
      // C5B: 60 days, so a claim late in the roadmap's range (day 25 to 37) still has its window after it.
      const run = autoplay(seed, 60, { village: true });
      const days = run.days;
      const claimed = days.findIndex((d) => d.rank === 'village');
      const why = `\n${formatDays(days)}\n\n${run.street ? frontageAscii(run.hamlet.world, streetRect(run.street)) : 'no street'}`;
      expect(claimed, why).toBeGreaterThan(0);
      // Fifteen days; a season more when the claim comes in autumn or winter, when the winter's
      // firewood and larder (C5A) hold building back until the thaw.
      const season = Math.floor((days[claimed]!.day - 1) / DAYS_PER_SEASON) % 4;
      const window = season >= 2 ? 15 + DAYS_PER_SEASON : 15;
      expect(claimed + window, why).toBeLessThan(days.length);
      const first = days[claimed]!;
      const later = days[claimed + window]!;
      expect(run.street, why).toBeTruthy();
      expect(later.growth!.homes, why).toBeGreaterThanOrEqual(5);
      expect(later.growth!.shops, why).toBeGreaterThanOrEqual(1);
      expect(later.residents, why).toBeGreaterThan(first.residents + 8);
      expect(later.departures, why).toBe(0);
      for (const d of days.slice(claimed, claimed + window + 1)) {
        expect(d.leanTimes, why).toBe(false);
        expect(d.foodMade + d.food, why).toBeGreaterThan(0);
        expect(d.miserable, why).toBeLessThanOrEqual(1);
        // Growth follows demand: a night starts nothing a zone kind did not want.
        const n = d.growth?.night;
        if (!n) continue;
        for (const k of ['homes', 'shops', 'crafts', 'farms'] as const) {
          expect(n.started[k], `${why}\nday ${d.day} ${k}`).toBeLessThanOrEqual(n.demand[k]);
        }
      }
    });
  }

  it('plays the same Village the same way twice', () => {
    const a = autoplay('hazel', VILLAGE_DAY + 2, { villageDay: VILLAGE_DAY }).hamlet.world;
    const b = autoplay('hazel', VILLAGE_DAY + 2, { villageDay: VILLAGE_DAY }).hamlet.world;
    expect(a.lots.length).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
  });
});
