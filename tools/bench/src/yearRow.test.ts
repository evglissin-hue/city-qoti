// C5.0: the year view prints '-' for I3 state with nothing to say yet, and reads it once it does.
import { describe, expect, it } from 'vitest';
import { startingTown } from './hamlet';
import { content } from '@qoti/content';
import { ResidentFlags } from '@qoti/sim';
import { lanternStats, r3Gaps, yearRow } from './yearRow';

describe('the year view', () => {
  it('prints clear weather and a dash for every I3 column a new valley has nothing in', () => {
    const w = startingTown('willow').world;
    expect(yearRow(w, 1)).toBe(
      '  1   1 Spring 1  clear       -     - -          -          -      -         -   -       -    -    -   -   -   -   -   -   -',
    );
  });

  it('reads the weather, warmth, festival, threat and raid once the tracks fill them', () => {
    const w = startingTown('willow').world;
    w.weather.today = 'snow';
    w.weather.river = { frozen: true, frozenTick: 0 };
    const home = (id: number, coldHours: number) => ({
      id,
      family: 'Test',
      members: [],
      homeId: 0,
      pantry: [],
      recentFoods: [],
      savings: 0,
      tier: 'settler' as const,
      arrivedDay: 0,
      lowMoodDays: 0,
      warmth: { burnedToday: 0, coldHours, coldDays: 0 },
    });
    w.households.push(home(9001, 3), home(9002, 0));
    w.festival.outcome = {
      attendance: 20,
      joy: { site: 1, variety: 1, menu: 1, music: 1, twist: 1 },
      stars: 4,
    };
    w.threats.scheduled = {
      season: 3,
      year: 0,
      day: 4,
      side: 'n',
      band: 'medium',
      strength: 5,
      telegraphTick: 0,
      signs: [],
    };
    w.threats.history.push({ tick: 0, band: 'small', side: 'e', stolen: 0, captured: 1, repelled: true });
    expect(yearRow(w, 9)).toBe(
      '  9   1 Spring 1  snow*       1     4 medium     held       -      -         -   -       -    -    -   -   -   -   -   -   -',
    );
  });

  it('reads the evening and the gaps once R2 fills them', () => {
    const w = startingTown('willow').world;
    w.evenings.tonight = {
      ...w.evenings.tonight,
      day: 12,
      weather: 'fair',
      grownups: 20,
      out: 15,
      scoreSum: 1300,
      treatsAtStops: 6,
      treatsPassing: 2,
      treatsDoorstep: 2,
    };
    w.gaps.open.push({ id: 1, kind: 'noTreats', subject: 'x', tile: 0, openedDay: 11, n: 4 } as never);
    expect(yearRow(w, 12)).toBe(
      ' 12   1 Spring 1  clear       -     - -          -          -      -        75  65      80    1    -   -   -   -   -   -   -',
    );
  });

  it('reads lanterns lit, what places drew, masters, pages, callings and the fourth gap (R3)', () => {
    const w = startingTown('willow').world;
    const candles = content.goodIndex.get('candles')!;
    const firewood = content.goodIndex.get('firewood')!;
    const lantern = content.decor.find((d) => d.supply?.kind === 'nightly')!;
    for (let i = 0; i < 4; i++) w.decor.push({ id: 7000 + i, def: lantern.id } as never);
    w.supplies.night = 5;
    w.supplies.lamps = [
      { id: 7000, reach: 0 },
      { id: 7001, reach: 0 },
      { id: 7002, reach: 0 },
    ];
    const row = new Array<number>(content.goods.length).fill(0);
    row[candles] = 2;
    row[firewood] = 3;
    w.supplies.drawn = [new Array<number>(content.goods.length).fill(0), row];
    w.residents.push({ id: 8000, flags: ResidentFlags.master, mastery: 'baker' } as never);
    w.townBook.pages.push(
      {
        id: 1,
        kind: 'specialty',
        def: 'x',
        place: 'p',
        name: 'X',
        day: 1,
        seats: [0, 1],
        leaning: 'gardens',
      } as never,
      {
        id: 2,
        kind: 'custom',
        def: 'y',
        place: 'p',
        name: 'Y',
        day: 1,
        seats: [0],
        leaning: 'gardens',
      } as never,
    );
    w.townBook.callings.push('market-gardens');
    const fourth = content.gaps.find((g) => g.from === 'R3')!.kind;
    w.gaps.open.push({ id: 2, kind: fourth, subject: 'x', tile: 0, openedDay: 4, n: 1 } as never);
    expect(lanternStats(w)).toEqual({ standing: 4, lit: 3 });
    expect(r3Gaps(w)).toEqual({ open: 1, closed: 0 });
    expect(yearRow(w, 5).slice(-27)).toBe('   75   2   3   1   2   1   1'.slice(-27));
  });
});
