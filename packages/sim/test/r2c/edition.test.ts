/* eslint-disable no-restricted-syntax */
// R2C: the evening edition (docs/spec/17-presentation.md, the evening edition). Places are injected
// by hand because R2A's place index is a stand-in that finds none.
import { describe, expect, it, vi } from 'vitest';
import type { EveningTally, EveningView, WorldState } from '../../src/contracts';
import { eveningView } from '../../src/view/evening';
import { givePlaces, indexFor } from './placestore';
import { bench, clone, gap, place, row, stock, tally, town } from './helpers';

vi.mock('../../src/systems/places/index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  placeIndex: (await import('./placestore')).indexFor,
}));

function lineProblems(view: EveningView): string[] {
  const bad: string[] = [];
  for (const l of view.lines) {
    if (l.text.includes('—')) bad.push(`em dash: ${l.text}`);
    if (/undefined|NaN|\s\s/.test(l.text)) bad.push(`junk: ${l.text}`);
    if (!/^[A-Z0-9]/.test(l.text)) bad.push(`capital: ${l.text}`);
    if (!l.text.endsWith('.')) bad.push(`period: ${l.text}`);
    if (/\b1 (grown-ups|coins|treats|friendships)\b/.test(l.text)) bad.push(`plural: ${l.text}`);
    if (l.seats.some((s, i) => i > 0 && s <= l.seats[i - 1]!)) bad.push(`seats unsorted: ${l.text}`);
  }
  return bad;
}

function evening(over: Partial<EveningTally>): { state: WorldState; f: ReturnType<typeof town> } {
  const f = town();
  f.state.evenings.tonight = tally(10, over);
  return { state: f.state, f };
}

describe('the evening edition', () => {
  it('is null before the first evening', () => {
    const f = town();
    expect(eveningView(f.state)).toBeNull();
  });

  describe('a day without news: one honest line', () => {
    const cases: [string, Partial<EveningTally>, string][] = [
      [
        'storm',
        { weather: 'storm', grownups: 20 },
        'A storm kept the whole town in. The kettles did well out of it.',
      ],
      ['no grown-ups', { grownups: 0 }, 'A quiet evening: nobody had anywhere to be, and nobody minded.'],
      [
        'nowhere',
        { grownups: 20, nowhere: 7 },
        'Not one of 20 grown-ups went out: nowhere was worth the walk.',
      ],
      [
        'one grown-up, nowhere',
        { grownups: 1, nowhere: 1 },
        "The town's one grown-up stayed in: nowhere was worth the walk.",
      ],
      ['plain', { grownups: 20 }, 'Everyone stayed in tonight. Some evenings are like that.'],
    ];
    for (const [name, over, text] of cases) {
      it(name, () => {
        const { state } = evening(over);
        const view = eveningView(state)!;
        expect(view.lines.map((l) => l.text)).toEqual([text]);
        expect(lineProblems(view)).toEqual([]);
      });
    }
  });

  describe('a day with news', () => {
    it('gives three to five lines, a gap closed today leading', () => {
      const { state } = evening({
        grownups: 20,
        out: 12,
        scoreSum: 1100,
        treatsAtStops: 9,
        treatsPassing: 3,
        friendships: 2,
        stood: 4,
        weather: 'rain',
      });
      state.places = [
        row('seats:1', 'the bench by the well', [14], [4200], [9]),
        row('seats:2', 'the green', [6]),
      ];
      state.gaps.closed = [gap(3, { closedDay: 10, closers: [0] })];
      const view = eveningView(state)!;
      expect(view.lines.length).toBe(5);
      expect(view.lines[0]!.text).toMatch(/Kat/);
      expect(view.lines[0]!.refs).toEqual(['gap:3', 'seats:1']);
      expect(view.lines[0]!.seats).toEqual([0]);
      expect(lineProblems(view)).toEqual([]);
    });

    it('shows an opened gap in its own words', () => {
      const { state } = evening({ grownups: 20, out: 10, scoreSum: 800 });
      state.gaps.open = [gap(4, { openedDay: 10, n: 11, subject: 'seats:1' })];
      state.places = [row('seats:1', 'the green', [11])];
      const view = eveningView(state)!;
      const opened = view.lines.find((l) => l.refs.includes('gap:4'))!;
      expect(opened.text).toMatch(/11 folk/);
      expect(opened.seats).toEqual([]);
      expect(lineProblems(view)).toEqual([]);
    });

    it('ignores a gap that opened another day', () => {
      const { state } = evening({ grownups: 5 });
      state.gaps.open = [gap(4, { openedDay: 9 })];
      expect(eveningView(state)!.lines.length).toBe(1);
    });

    it('pads to three when only a gap is news and nobody went out', () => {
      const { state } = evening({ grownups: 20, out: 0, nowhere: 6 });
      state.gaps.closed = [gap(3, { closedDay: 10, closers: [1] })];
      const view = eveningView(state)!;
      expect(view.lines.map((l) => l.text).slice(1)).toEqual([
        'Nobody went out tonight: 6 of 20 grown-ups had nowhere worth the walk.',
        'The rest of the evening passed without remark.',
      ]);
      expect(lineProblems(view)).toEqual([]);
    });

    it('pads without the nowhere count when nobody lacked a place', () => {
      const { state } = evening({ grownups: 20, out: 0 });
      state.gaps.closed = [gap(3, { closedDay: 10, closers: [1] })];
      expect(eveningView(state)!.lines[1]!.text).toBe('Nobody went out tonight.');
    });

    it('pads a thin evening to three with the remark line, once', () => {
      const { state } = evening({ grownups: 4, out: 2, scoreSum: 200 });
      const view = eveningView(state)!;
      expect(view.lines.map((l) => l.text)).toEqual([
        '2 of 4 grown-ups went out, and the evening averaged 50.',
        'Not one treat was sold on the round. The shelves and the walkers kept to different streets.',
        'The rest of the evening passed without remark.',
      ]);
    });

    it('handles the singulars', () => {
      const { state } = evening({
        grownups: 1,
        out: 1,
        scoreSum: 70,
        treatsPassing: 1,
        friendships: 1,
        stood: 1,
      });
      const texts = eveningView(state)!.lines.map((l) => l.text);
      expect(texts).toEqual([
        "The town's one grown-up went out, and the evening scored 70.",
        'One treat went on the round, bought in passing.',
        'Two folk became friends tonight, which is how it starts.',
        'One soul stood for want of a seat. A bench or two would not go amiss.',
      ]);
    });

    it('says every grown-up went out, and counts treats at stops', () => {
      const { state } = evening({
        grownups: 8,
        out: 8,
        scoreSum: 520,
        treatsAtStops: 6,
        friendships: 3,
        stood: 12,
      });
      const texts = eveningView(state)!.lines.map((l) => l.text);
      expect(texts[0]).toBe('Every grown-up in town went out, all 8 of them, and the evening averaged 65.');
      expect(texts[1]).toBe('6 treats went on the round, every one of them at a stop.');
      expect(texts[2]).toBe('3 new friendships were struck up tonight.');
      expect(texts[3]).toBe('12 folk stood for want of a seat. A bench or two would not go amiss.');
    });
  });

  describe('the cross-lane line', () => {
    interface Setup {
      hearthSeat?: 0 | 1 | null;
      outletSeat?: 0 | 1;
      grown?: boolean;
      stocked?: boolean;
      visitors?: number;
      takings?: number;
      sold?: number;
      noOutlet?: boolean;
    }
    function crossLane(s: Setup): {
      state: WorldState;
      line: EveningView['lines'][number];
      view: EveningView;
    } {
      const { state, f } = evening({ grownups: 20, out: 10, scoreSum: 800 });
      const stall = f.b.stalls[0];
      const b = state.buildings.find((x) => x.id === stall)!;
      b.builtBy = s.outletSeat ?? 1;
      if (s.grown) b.lot = f.lots.shops[0]!;
      if (s.stocked !== false) stock(state, stall);
      const members = s.hearthSeat === null ? [] : [bench(state, s.hearthSeat ?? 0)];
      givePlaces(state, [place('seats:1', { members, outlets: s.noOutlet ? [] : [stall], seats: 6 })]);
      state.places = [
        row('seats:1', 'the bench by the well', [s.visitors ?? 14], [s.takings ?? 4200], [s.sold ?? 0]),
      ];
      const view = eveningView(state)!;
      const line = view.lines.find((l) => l.refs[0] === 'seats:1')!;
      expect(lineProblems(view)).toEqual([]);
      return { state, line, view };
    }

    it('credits both seats when the lanes differ', () => {
      const { line, view } = crossLane({});
      expect(line.text).toBe(
        "The bench by the well, Kat's doing, brought 14 folk past the market stall: 42 coins in Sam's till.",
      );
      expect(line.seats).toEqual([0, 1]);
      expect(line.refs[1]).toMatch(/^building:\d+$/);
      expect(view.places[0]).toMatchObject({ id: 'seats:1', visitors: 14, seats: 6, takings: 4200 });
    });

    it('names the hearth alone when one seat did both', () => {
      const { line } = crossLane({ outletSeat: 0 });
      expect(line.text).toBe(
        "The bench by the well, Kat's doing, brought 14 folk past the market stall: 42 coins.",
      );
      expect(line.seats).toEqual([0]);
    });

    it('credits a grown business to the Ledger-lens seat', () => {
      const { line } = crossLane({ outletSeat: 0, grown: true });
      expect(line.text).toContain("42 coins in Sam's till.");
      expect(line.seats).toEqual([0, 1]);
    });

    it('credits nobody when no seat laid the place', () => {
      const { line } = crossLane({ hearthSeat: null });
      expect(line.text).toBe('The bench by the well brought 14 folk past the market stall: 42 coins.');
      expect(line.seats).toEqual([]);
    });

    it('handles one visitor and one coin', () => {
      const { line } = crossLane({ visitors: 1, takings: 100 });
      expect(line.text).toContain('brought one soul past');
      expect(line.text).toContain(': 1 coin in');
    });

    it('says what a Hamlet handed out when the till is empty', () => {
      const { line } = crossLane({ takings: 0, sold: 5 });
      expect(line.text).toBe(
        "The bench by the well, Kat's doing, drew 14 folk, and the market stall handed out 5 treats.",
      );
      expect(line.seats).toEqual([0]);
      expect(crossLane({ takings: 0, sold: 1 }).line.text).toContain('handed out a treat.');
      expect(crossLane({ takings: 0, sold: 1, hearthSeat: null }).line.text).toBe(
        'The bench by the well drew 14 folk, and the market stall handed out a treat.',
      );
    });

    it('falls back to the plain line with no outlet or no sales', () => {
      expect(crossLane({ noOutlet: true }).line.text).toBe(
        "The bench by the well, Kat's doing, drew 14 folk tonight.",
      );
      expect(crossLane({ takings: 0, sold: 0 }).line.text).toBe(
        "The bench by the well, Kat's doing, drew 14 folk tonight.",
      );
      expect(crossLane({ noOutlet: true, hearthSeat: null }).line.text).toBe(
        'The bench by the well drew 14 folk tonight.',
      );
    });

    it('still finds the outlet when its shelf is bare', () => {
      const { line } = crossLane({ stocked: false });
      expect(line.text).toContain('past the market stall');
    });

    it('draws a row the index no longer finds without credit', () => {
      const { state } = evening({ grownups: 20, out: 10, scoreSum: 800 });
      state.places = [row('seats:9', 'the old green', [3], [900])];
      const view = eveningView(state)!;
      expect(view.lines.find((l) => l.refs[0] === 'seats:9')!.text).toBe(
        'The old green drew 3 folk tonight.',
      );
      expect(view.places[0]!.seats).toBe(0);
    });

    it('names a second place as next busiest, and ranks ties by id', () => {
      const { state } = evening({ grownups: 20, out: 10, scoreSum: 800 });
      givePlaces(state, [place('seats:1', { members: [bench(state, 1)] }), place('seats:2')]);
      state.places = [
        row('seats:1', 'the green', [5]),
        row('seats:2', 'the pump', [5]),
        row('seats:3', 'the lane', [9]),
        row('seats:4', 'the empty one', [0]),
      ];
      const view = eveningView(state)!;
      expect(view.places.map((p) => p.id)).toEqual(['seats:3', 'seats:1', 'seats:2']);
      expect(view.lines.map((l) => l.text)).toContain(
        "The green, Sam's doing, was next busiest, with 5 folk.",
      );
    });
  });

  describe('determinism', () => {
    function busy(): WorldState {
      const { state, f } = evening({
        grownups: 20,
        out: 10,
        scoreSum: 800,
        treatsAtStops: 4,
        treatsPassing: 2,
        weather: 'rain',
      });
      stock(state, f.b.stalls[0]);
      state.buildings.find((x) => x.id === f.b.stalls[0])!.builtBy = 1;
      givePlaces(state, [place('seats:1', { members: [bench(state, 0)], outlets: [f.b.stalls[0]] })]);
      state.places = [row('seats:1', 'the green', [9], [2500])];
      state.gaps.closed = [gap(2, { closedDay: 10, closers: [0, 1] })];
      return state;
    }

    it('reads the same from a clone and from a second call', () => {
      const state = busy();
      const copy = clone(state);
      givePlaces(copy, indexFor(state).places);
      expect(eveningView(state)).toEqual(eveningView(state));
      expect(eveningView(copy)).toEqual(eveningView(state));
    });

    it('is not moved by the doorstep errand', () => {
      const state = busy();
      const before = eveningView(state)!;
      state.evenings.tonight.treatsDoorstep = 99;
      const after = eveningView(state)!;
      expect(after.lines).toEqual(before.lines);
    });

    it('does not mutate the state', () => {
      const state = busy();
      const snap = clone(state);
      eveningView(state);
      expect(state.places).toEqual(snap.places);
      expect(state.evenings).toEqual(snap.evenings);
    });
  });
});
