// R3H: the level line's words, each good kind, a slide, a rest, the top, and the whole class.
import { content } from '@qoti/content';
import { levelGains, type SpecializedClimbView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { climbLine, todayLine } from './specializedWords';

const def = (id: string) => content.buildingById.get(id)!;

function climb(over: Partial<SpecializedClimbView>): SpecializedClimbView {
  return {
    level: 1,
    max: 3,
    days: 0,
    upDays: 3,
    downDays: 4,
    good: 'carried',
    today: { have: 0, need: 0 },
    next: [],
    lose: [],
    ...over,
  };
}

describe('climbLine', () => {
  it('words a lodge climbing', () => {
    const line = climbLine(
      climb({ days: 1, next: ['a fourth hand', 'its woods out to 10 tiles'] }),
      def('foresters-lodge'),
    );
    expect(line).toBe(
      "Two more good days of timber carried off and the forester's lodge grows to level 2: a fourth hand and its woods out to 10 tiles.",
    );
  });

  it('says one more day in the singular', () => {
    expect(climbLine(climb({ days: 2, next: ['a fourth hand'] }), def('quarry'))).toMatch(
      /^One more good day of/,
    );
  });

  it('words a stall failing', () => {
    const line = climbLine(
      climb({
        level: 2,
        days: -1,
        good: 'customers',
        lose: ['a second vendor', 'customers from 18 tiles away'],
      }),
      def('market-stall'),
    );
    expect(line).toBe(
      'A poor day: three more in a row and the market stall slips back to level 1, giving up a second vendor and customers from 18 tiles away.',
    );
  });

  it('words a windmill and a granary climbing', () => {
    const full = { taken: 2, room: 2 };
    const wind = climbLine(
      climb({ good: 'served', places: full, next: ['room for a third baker'] }),
      def('windmill'),
    );
    expect(wind).toMatch(/bakers kept in grain and the windmill grows to level 2: room for a third baker\.$/);
    const gran = climbLine(
      climb({
        good: 'full',
        today: { have: 100, need: 396 },
        next: ['a third porter', 'room for 1,680 goods'],
      }),
      def('granary'),
    );
    expect(gran).toContain('396 goods in store and every porter in');
  });

  it('names the place a mill waits to fill (a full house climbs, the ruling of 2026-11-22)', () => {
    const one = climbLine(
      climb({ good: 'served', level: 2, places: { taken: 2, room: 3 }, next: ['room for a fourth baker'] }),
      def('windmill'),
    );
    expect(one).toMatch(/^When a third baker takes the last place and all are kept in grain, /);
    expect(one).toMatch(/the windmill grows to level 3: room for a fourth baker\.$/);
    const two = climbLine(
      climb({ good: 'served', places: { taken: 0, room: 2 }, next: ['room for a third baker'] }),
      def('windmill'),
    );
    expect(two).toMatch(/^When two more bakers take the empty places/);
  });

  it('says a store keeps the room it earned, and never warns of a slide', () => {
    const at2 = climbLine(climb({ good: 'full', level: 2, today: { have: 0, need: 840 } }), def('granary'));
    expect(at2).toMatch(/A store keeps the room it has earned\.$/);
    expect(at2).not.toMatch(/slips back/);
    expect(climbLine(climb({ good: 'full', level: 3 }), def('granary'))).toBe(
      'Level 3, as big as a granary gets. A store keeps the room it has earned.',
    );
  });

  it('rests while the river is frozen', () => {
    expect(climbLine(climb({ resting: true }), def('fishery'))).toBe(
      'Resting while the river is frozen; its days wait for the thaw.',
    );
  });

  it('is dry at the top', () => {
    expect(climbLine(climb({ level: 3 }), def('granary'))).toBe('Level 3, as big as a granary gets.');
  });
});

describe('todayLine', () => {
  it('counts each good kind', () => {
    expect(todayLine(climb({ today: { have: 24, need: 30 } }))).toBe('Today: 24 of 30 carried off.');
    expect(todayLine(climb({ good: 'customers', today: { have: 6, need: 8 } }))).toBe(
      'Today: 6 customers of 8.',
    );
    expect(todayLine(climb({ good: 'served', today: { have: 2, need: 2 } }), def('windmill'))).toBe(
      'Today: 2 of 2 bakers kept supplied.',
    );
    expect(todayLine(climb({ good: 'full', today: { have: 380, need: 600 } }))).toBe(
      'In store: 380 of the 600 a good day needs.',
    );
  });

  it('says nothing when nothing was made', () => {
    expect(todayLine(climb({}))).toBeNull();
  });
});

describe('every specialized building, every level', () => {
  const defs = content.buildings.filter((d) => d.levels?.good);
  it('has some', () => expect(defs.length).toBeGreaterThanOrEqual(10));
  for (const d of defs) {
    const max = Math.max(
      d.levels!.crew?.length ?? 0,
      d.levels!.reach?.length ?? 0,
      d.levels!.storage?.length ?? 0,
      d.levels!.capacity?.length ?? 0,
      1,
    );
    it(`${d.id} words clean lines`, () => {
      const lines: string[] = [];
      for (let level = 1; level <= max; level++) {
        const base = climb({
          level,
          max,
          good: d.levels!.good!,
          today: { have: 3, need: 8 },
          next: level < max ? levelGains(d, level + 1) : [],
          lose: level > 1 ? levelGains(d, level) : [],
        });
        lines.push(climbLine(base, d), climbLine({ ...base, resting: true }, d));
        if (level > 1) lines.push(climbLine({ ...base, days: -2 }, d));
        const t = todayLine(base, d);
        if (t) lines.push(t);
      }
      for (const l of lines) {
        expect(l).not.toMatch(/—|–/);
        expect(l).not.toContain('undefined');
        expect(l).not.toContain('  ');
        expect(l).toMatch(/\.$/);
      }
    });
  }
});
