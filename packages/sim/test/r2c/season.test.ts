/* eslint-disable no-restricted-syntax */
// R2C: the season report's cross-lane lines (`together`), built on the season's last day.
import { describe, expect, it, vi } from 'vitest';
import type { Gap, SeasonReportLine, WorldState } from '../../src/contracts';
import { seasonReportView } from '../../src/view/season';
import { eveningSeasonLines } from '../../src/view/season/evening';
import { bench, clone, gap, place, row, stock, tally, tickOnDay, town } from './helpers';
import { givePlaces, indexFor } from './placestore';

vi.mock('../../src/systems/places/index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  placeIndex: (await import('./placestore')).indexFor,
}));

// Day 11 is the sixth and last day of season 1 (days 6 to 11).
const LAST = 11;

function problems(lines: SeasonReportLine[]): string[] {
  const bad: string[] = [];
  for (const l of lines) {
    if (l.text.includes('—')) bad.push(`em dash: ${l.text}`);
    if (/undefined|NaN|\s\s/.test(l.text)) bad.push(`junk: ${l.text}`);
    if (!/^[A-Z0-9]/.test(l.text)) bad.push(`capital: ${l.text}`);
    if (!l.text.endsWith('.')) bad.push(`period: ${l.text}`);
    if (l.track !== 'evening') bad.push(`track: ${l.text}`);
  }
  return bad;
}

function lastDay(): { state: WorldState; f: ReturnType<typeof town> } {
  const f = town();
  f.state.tick = tickOnDay(LAST);
  return { state: f.state, f };
}

function season(): { state: WorldState; f: ReturnType<typeof town> } {
  const { state, f } = lastDay();
  const stall = f.b.stalls[0];
  stock(state, stall);
  state.buildings.find((b) => b.id === stall)!.builtBy = 1;
  givePlaces(state, [place('seats:1', { members: [bench(state, 0)], outlets: [stall] })]);
  state.places = [
    { ...row('seats:1', 'the bench by the well', [10, 12, 8, 14, 6, 5], [0, 1000, 800, 1400, 600, 500]) },
    row('seats:2', 'the green', [3, 3, 3, 3, 3, 3]),
  ];
  state.gaps.closed = [
    gap(1, { closedDay: 4, closers: [0] }), // last season
    gap(2, { closedDay: 7, closers: [0] }),
    gap(3, { closedDay: 9, closers: [1] }),
    gap(4, { closedDay: 10, closers: [0] }),
    gap(5, { closedDay: 10 }), // uncredited
  ];
  state.evenings.history = [
    tally(4, { grownups: 20, out: 20, friendships: 9 }), // last season
    tally(6, { grownups: 20, out: 10, friendships: 1 }),
    tally(7, { grownups: 20, out: 12, friendships: 0 }),
    tally(8, { grownups: 0 }),
    tally(9, { grownups: 20, out: 14, friendships: 2 }),
    tally(10, { grownups: 20, out: 8, friendships: 0 }),
  ];
  state.evenings.tonight = tally(LAST, { grownups: 20, out: 10, friendships: 1 });
  return { state, f };
}

describe('the season report, together', () => {
  it('is absent with no evening data, so old reports stay equal', () => {
    const { state } = lastDay();
    expect(eveningSeasonLines(state)).toEqual([]);
    expect('together' in seasonReportView(state)).toBe(false);
  });

  it('is absent on a season whose evenings had no grown-ups and no news', () => {
    const { state } = lastDay();
    state.evenings.tonight = tally(LAST);
    expect(seasonReportView(state).together).toBeUndefined();
  });

  it('writes the lines in order with their values and seats', () => {
    const { state } = season();
    const together = seasonReportView(state).together!;
    expect(problems(together)).toEqual([]);
    expect(together[0]).toMatchObject({ value: 4, seats: [0, 1] });
    expect(together[0]!.text).toBe('4 gaps mended this season: Kat closed 2 and Sam 1.');
    // two mended gaps in their own words, oldest first, only those with closers
    expect(together[1]!.seats).toEqual([0]);
    expect(together[2]!.seats).toEqual([1]);
    // the busiest place
    expect(together[3]).toEqual({
      track: 'evening',
      text: "The bench by the well, Kat's doing, drew 55 folk this season; the market stall took 43 coins from them, to Sam's credit.",
      value: 55,
      seats: [0, 1],
    });
    // the evenings (days 6 to 11 only, the empty one skipped)
    expect(together[4]).toEqual({
      track: 'evening',
      text: 'On an average evening this season, 54% of the grown-ups went out.',
      value: 54,
    });
    expect(together[5]).toEqual({
      track: 'evening',
      text: '4 friendships were made on the evening round this season.',
      value: 4,
    });
    expect(together).toHaveLength(6);
  });

  it('is the same from a clone', () => {
    const { state } = season();
    const copy = clone(state);
    givePlaces(copy, indexFor(state).places);
    expect(seasonReportView(copy)).toEqual(seasonReportView(state));
    expect(seasonReportView(state)).toEqual(seasonReportView(state));
  });

  describe('the gaps line', () => {
    function withGaps(...closers: (number[] | undefined)[]): string {
      const { state } = lastDay();
      state.gaps.closed = closers.map((c, i) =>
        gap(i + 1, { closedDay: 8, ...(c ? { closers: c } : {}) } as Partial<Gap>),
      );
      const line = eveningSeasonLines(state)[0]!;
      expect(problems([line])).toEqual([]);
      return line.text;
    }
    it('reads one gap', () => {
      expect(withGaps([1])).toBe('One gap mended this season, by Sam.');
      expect(withGaps([0, 1])).toBe('One gap mended this season, by Kat and Sam.');
      expect(withGaps(undefined)).toBe('One gap mended this season.');
    });
    it('reads many gaps by one seat, split across seats, or with nobody credited', () => {
      expect(withGaps([0], [0], [0])).toBe('3 gaps mended this season, every one by Kat.');
      expect(withGaps([0], [0], [0], [1])).toBe('4 gaps mended this season: Kat closed 3 and Sam 1.');
      expect(withGaps([0], undefined)).toBe('2 gaps mended this season: Kat closed 1.');
      expect(withGaps(undefined, undefined)).toBe('2 gaps mended this season.');
    });
    it('shows at most two closed gaps, and none when nobody closed them', () => {
      const { state } = lastDay();
      state.gaps.closed = [1, 2, 3].map((i) => gap(i, { closedDay: 7 + i, closers: [0] }));
      expect(eveningSeasonLines(state)).toHaveLength(3);
      state.gaps.closed = [gap(1, { closedDay: 8 })];
      expect(eveningSeasonLines(state)).toHaveLength(1);
    });
  });

  describe('the busiest place', () => {
    function busiest(
      takings: number[],
      visitors = [4, 4, 4, 0, 0, 0],
      setup?: (s: WorldState) => void,
    ): SeasonReportLine {
      const { state, f } = lastDay();
      const stall = f.b.stalls[0];
      state.buildings.find((b) => b.id === stall)!.builtBy = 0;
      setup?.(state);
      givePlaces(state, [place('seats:1', { members: [bench(state, 0)], outlets: [stall] })]);
      state.places = [row('seats:1', 'the well bench', visitors, takings)];
      const lines = eveningSeasonLines(state);
      expect(problems(lines)).toEqual([]);
      return lines[0]!;
    }
    it('says the outlet took coins when one seat did both', () => {
      expect(busiest([0, 500, 700, 0, 0, 0]).text).toBe(
        "The well bench, Kat's doing, drew 12 folk this season, and the market stall took 12 coins from them.",
      );
    });
    it('says one coin, and one soul', () => {
      expect(busiest([100, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]).text).toBe(
        "The well bench, Kat's doing, drew one soul this season, and the market stall took 1 coin from them.",
      );
    });
    it('keeps to the visitors when the till stayed empty', () => {
      const line = busiest([0, 0, 0, 0, 0, 0]);
      expect(line.text).toBe("The well bench, Kat's doing, drew 12 folk this season.");
      expect(line).toMatchObject({ value: 12, seats: [0] });
    });
    it('breaks a tie to the lowest id', () => {
      const { state } = lastDay();
      state.places = [row('seats:1', 'the old pump', [5]), row('seats:2', 'the green', [5])];
      expect(eveningSeasonLines(state)[0]!.text).toBe('The old pump drew 5 folk this season.');
      expect(eveningSeasonLines(state)[0]!.seats).toBeUndefined();
    });
  });

  describe('the evenings', () => {
    it('counts only this season, and singular friendship', () => {
      const { state } = lastDay();
      state.evenings.history = [tally(5, { grownups: 10, out: 10, friendships: 5 })];
      state.evenings.tonight = tally(LAST, { grownups: 10, out: 3, friendships: 1 });
      const texts = eveningSeasonLines(state).map((l) => l.text);
      expect(texts).toEqual([
        'On an average evening this season, 30% of the grown-ups went out.',
        'One friendship was made on the evening round this season.',
      ]);
    });
  });
});
