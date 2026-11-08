import { SEASON_LOOK } from '@qoti/art';
import { DAYS_PER_SEASON } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { CLEAR_WEATHER, easeWeather, seasonBlendAt, weatherLookFor } from './seasons';

describe('seasonBlendAt', () => {
  it('settles the first snow through the first day of winter and melts it on the first of spring', () => {
    expect(seasonBlendAt(3, 1, 0).snow).toBe(0);
    expect(seasonBlendAt(3, 1, 10).snow).toBeGreaterThan(0);
    expect(seasonBlendAt(3, 1, 10).snow).toBeLessThan(1);
    expect(seasonBlendAt(3, 3, 12).snow).toBe(1);
    expect(seasonBlendAt(0, 1, 0).snow).toBe(1);
    expect(seasonBlendAt(0, 1, 23.75).snow).toBe(0);
    expect(seasonBlendAt(1, 3, 12).snow).toBe(0);
  });

  it('never steps by more than a little between quarter hours', () => {
    for (let s = 0; s < 4; s++)
      for (let d = 1; d <= DAYS_PER_SEASON; d++)
        for (let q = 0; q < 95; q++) {
          const a = seasonBlendAt(s, d, q / 4);
          const b = seasonBlendAt(s, d, (q + 1) / 4);
          for (const k of ['snow', 'autumn', 'bare', 'blossom'] as const)
            expect(Math.abs(a[k] - b[k])).toBeLessThan(0.1);
        }
  });

  it('turns the foliage tint from the season before over the first day', () => {
    expect(seasonBlendAt(2, 1, 0).tint).toBe(SEASON_LOOK.summer.tint);
    expect(seasonBlendAt(2, 2, 12).tint).toBe(SEASON_LOOK.autumn.tint);
  });

  it('has autumn colors in autumn, bare branches in winter and blossom in spring', () => {
    expect(seasonBlendAt(2, 4, 12).autumn).toBeGreaterThan(0.9);
    expect(seasonBlendAt(3, 3, 12).bare).toBe(1);
    expect(seasonBlendAt(0, 2, 12).blossom).toBeGreaterThan(0.5);
    expect(seasonBlendAt(1, 4, 12)).toMatchObject({ autumn: 0, bare: 0, blossom: 0, snow: 0 });
  });
});

describe('weather looks', () => {
  it('maps each kind and eases toward it', () => {
    expect(weatherLookFor('storm', false)).toMatchObject({ rain: 1, storm: 1, overcast: 1 });
    expect(weatherLookFor('clear', true).dry).toBe(1);
    expect(weatherLookFor(null, false)).toEqual(CLEAR_WEATHER);
    const cur = { ...CLEAR_WEATHER };
    expect(easeWeather(cur, weatherLookFor('fog', false), 1)).toBe(true);
    expect(cur.fog).toBeCloseTo(0.25);
    for (let i = 0; i < 10; i++) easeWeather(cur, weatherLookFor('fog', false), 1);
    expect(cur.fog).toBe(1);
    expect(easeWeather(cur, weatherLookFor('fog', false), 1)).toBe(false);
  });
});
