// C4B acceptance (docs/build/cycle-04b-growth.md): from a hamlet the autoplayer has grown, the
// valley becomes a Village, the Ledger lays and zones a high street, and over the next ten days
// the zoned frontage grows homes, shops and crafts by itself, never starting what the night did not
// want, while the town keeps eating, never runs into lean times and nobody leaves.
import { hashState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay, formatDays } from './autoplay';
import { frontageAscii, streetRect } from './village';

const VILLAGE_DAY = 12;

describe('a Village grows its high street', { timeout: 180_000 }, () => {
  for (const seed of ['willow', 'hazel']) {
    it(`grows homes, shops and crafts on ${seed}'s zoned frontage in ten days`, () => {
      const run = autoplay(seed, VILLAGE_DAY + 10, { village: VILLAGE_DAY });
      const days = run.days;
      const first = days[VILLAGE_DAY - 1]!;
      const last = days[days.length - 1]!;
      const why = `\n${formatDays(days)}\n\n${run.street ? frontageAscii(run.hamlet.world, streetRect(run.street)) : 'no street'}`;
      expect(run.street, why).toBeTruthy();
      expect(last.growth!.homes, why).toBeGreaterThanOrEqual(5);
      expect(last.growth!.shops, why).toBeGreaterThanOrEqual(1);
      expect(last.growth!.crafts, why).toBeGreaterThanOrEqual(1);
      expect(last.residents, why).toBeGreaterThan(first.residents + 8);
      expect(last.departures, why).toBe(0);
      for (const d of days.slice(VILLAGE_DAY)) {
        expect(d.leanTimes, why).toBe(false);
        expect(d.foodMade + d.food, why).toBeGreaterThan(0);
        expect(d.miserable, why).toBeLessThanOrEqual(1);
        // Growth follows demand: a night starts nothing a zone kind did not want.
        const n = d.growth!.night!;
        for (const k of ['homes', 'shops', 'crafts', 'farms'] as const) {
          expect(n.started[k], `${why}\nday ${d.day} ${k}`).toBeLessThanOrEqual(n.demand[k]);
        }
      }
    });
  }

  it('plays the same Village the same way twice', () => {
    const a = autoplay('hazel', VILLAGE_DAY + 2, { village: VILLAGE_DAY }).hamlet.world;
    const b = autoplay('hazel', VILLAGE_DAY + 2, { village: VILLAGE_DAY }).hamlet.world;
    expect(a.lots.length).toBeGreaterThan(0);
    expect(hashState(a)).toBe(hashState(b));
  });
});
