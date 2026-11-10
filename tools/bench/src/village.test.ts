// C4B acceptance (docs/build/cycle-04b-growth.md): from a hamlet the autoplayer has grown, the
// valley becomes a Village, the Ledger lays and zones a high street, and over the next days
// the zoned frontage grows homes and shops by itself, never starting what the night did not want,
// while the town keeps eating, never runs into lean times and nobody leaves.
// C4X: on the real Village run (the Charter claimed, the Village player at work) rather than a
// Village granted on day 12. Fifteen days, not ten: the far end of the street waits for its
// storehouse before porters can bring timber.
// R1.0: the first street is zoned on day 1 (Homes, Workshops, Farmland); at Village rank another
// street adds shops and townhouses. The growth targets wait for R1F; the granted Village's street
// and determinism hold.
import { DAYS_PER_SEASON, hashState, Zone } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay, formatDays } from './autoplay';
import { frontageAscii, streetRect } from './village';

const VILLAGE_DAY = 12;

describe('a Village grows its high street', { timeout: 180_000 }, () => {
  for (const seed of ['willow', 'hazel']) {
    // R1.0: stand-ins; R1F rewrites the advisors and their targets.
    it.skip(`grows homes and shops on ${seed}'s zoned frontage in fifteen days`, () => {
      // C5B: 60 days, so a claim late in the roadmap's range (day 25 to 37) still has its window after it.
      const run = autoplay(seed, 60, { village: true });
      const days = run.days;
      const claimed = days.findIndex((d) => d.rank === 'village');
      const why = `\n${formatDays(days)}\n\n${run.street ? frontageAscii(run.hamlet.world, streetRect(run.street)) : 'no street'}`;
      expect(claimed, why).toBeGreaterThan(0);
      // Fifteen days; a season more when the window crosses a winter (C5A, C5X).
      const winterIn = (d: number) => Math.floor((d - 1) / DAYS_PER_SEASON) % 4 === 3;
      const day0 = days[claimed]!.day;
      const crosses = Array.from({ length: 16 }, (_, k) => day0 + k).some(winterIn);
      const window = crosses ? 15 + DAYS_PER_SEASON : 15;
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
      }
    });
  }

  it('zones shops and townhouses once the Village is granted, and plays it the same way twice', () => {
    const run = autoplay('hazel', VILLAGE_DAY + 2, { villageDay: VILLAGE_DAY });
    const a = run.hamlet.world;
    const why = `\n${formatDays(run.days)}\n${run.actions.join('\n')}`;
    expect(a.lots.length, why).toBeGreaterThan(0);
    expect(
      run.actions.some((x) => x === `${VILLAGE_DAY}:zone the village street`),
      why,
    ).toBe(true);
    const zones = new Set(a.map.zone.filter((z) => z > 0));
    expect(zones.has(Zone.shops), why).toBe(true);
    const b = autoplay('hazel', VILLAGE_DAY + 2, { villageDay: VILLAGE_DAY }).hamlet.world;
    expect(hashState(a)).toBe(hashState(b));
  });
});
