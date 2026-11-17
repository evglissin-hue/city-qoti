import { describe, expect, it } from 'vitest';
import { runCartScene, type CartRun } from './cartScene';
import {
  formatRows,
  measureFirstCraftsfolk,
  measureGaps,
  measureNoPlaces,
  measureOut,
  measureOverflow,
  measureTreats,
  rowCartOneRoad,
  rowFirstCraftsfolk,
  rowOut,
  rowOverflow,
  rowNoPlaces,
  rowsCartLoop,
  rowsGaps,
  rowTreats,
  type DaySample,
  type EveningSample,
  type SeenGap,
} from './outcomes';

const eve = (o: Partial<EveningSample> = {}): EveningSample => ({
  day: 1,
  weather: 'fair',
  eligible: 10,
  out: 10,
  outAny: 10,
  places: 3,
  treatsAtStops: 8,
  treatsPassing: 2,
  treatsDoorstep: 1,
  ...o,
});

const cart = (o: Partial<CartRun> = {}): CartRun => ({
  scene: 'loop',
  marked: true,
  jobTaken: true,
  tripTicks: 500,
  deliveredAt: 19,
  onEveningTiles: 0,
  parkedAtEnd: true,
  endHour: 23,
  ...o,
});

describe('outcome 1: out on a fair evening', () => {
  it('passes when every grown-up in reach goes out, and ignores rainy evenings', () => {
    const evenings = [eve({ day: 1 }), eve({ day: 2, weather: 'rain', out: 2 })];
    expect(measureOut(evenings)).toMatchObject({ evenings: 1, worst: 1, mean: 1 });
    expect(rowOut('willow', evenings).verdict).toBe('PASS');
  });

  it('misses with the worst evening named', () => {
    const evenings = [eve({ day: 4 }), eve({ day: 5, out: 6 })];
    const m = measureOut(evenings);
    expect(m.worst).toBeCloseTo(0.6);
    expect(m.worstDay).toBe(5);
    expect(m.mean).toBeCloseTo(0.8);
    expect(rowOut('willow', evenings).verdict).toBe('MISS');
  });

  it('misses honestly when no evening had a place in reach', () => {
    const row = rowOut('willow', [eve({ eligible: 0, out: 0 })]);
    expect(row.verdict).toBe('MISS');
    expect(row.measured).toContain('no fair evening');
  });

  it('counts places over their room', () => {
    const ok = [{ day: 1, hour: 18, place: 'p', present: 5, room: 5 }];
    const over = [...ok, { day: 1, hour: 19, place: 'p', present: 6, room: 5 }];
    expect(measureOverflow(ok).overflows).toBe(0);
    expect(rowOverflow('hazel', ok).verdict).toBe('PASS');
    expect(measureOverflow(over).overflows).toBe(1);
    expect(rowOverflow('hazel', over).verdict).toBe('MISS');
    expect(rowOverflow('hazel', []).verdict).toBe('MISS');
  });
});

describe('outcome 2: no places, nobody out', () => {
  const last: DaySample = { day: 70, crafts: 0, households: 12 };
  it('passes when nobody goes out on place-free evenings, and says so when there are none', () => {
    const none = [eve({ places: 0, eligible: 0, out: 0, outAny: 0 })];
    expect(measureNoPlaces(none)).toEqual({ placeFreeEvenings: 1, outOnThem: 0, inReachEvenings: 0 });
    const rows = rowNoPlaces('willow', none, last);
    expect(rows.map((r) => r.verdict)).toEqual(['PASS', 'PASS']);
    const some = rowNoPlaces('willow', [eve()], last);
    expect(some[0]!.verdict).toBe('N/A');
    expect(some[0]!.measured).toContain('no place-free evening');
    expect(some[1]!.verdict).toBe('N/A');
  });

  it('misses when folk are out with no place, or Craftsfolk came with none in reach', () => {
    const rows = rowNoPlaces('willow', [eve({ places: 0, eligible: 0, out: 0, outAny: 3 })], {
      ...last,
      crafts: 2,
    });
    expect(rows.map((r) => r.verdict)).toEqual(['MISS', 'MISS']);
  });
});

describe('outcome 3: Treats on the round', () => {
  it('passes at 80% or more over evenings with three places', () => {
    const evenings = [
      eve({ treatsAtStops: 8, treatsPassing: 2, treatsDoorstep: 3 }),
      eve({ places: 1, treatsAtStops: 0, treatsPassing: 0, treatsDoorstep: 50 }),
    ];
    expect(measureTreats(evenings)).toEqual({ evenings: 1, onRound: 10, total: 13 });
    expect(rowTreats('willow', evenings).verdict).toBe('MISS');
    expect(
      rowTreats('willow', [eve({ treatsDoorstep: 1, treatsAtStops: 9, treatsPassing: 1 })]).verdict,
    ).toBe('PASS');
  });

  it('misses with a reason when there was no such evening or nothing sold', () => {
    expect(rowTreats('willow', [eve({ places: 2 })]).measured).toContain('no evening with three places');
    const none = eve({ treatsAtStops: 0, treatsPassing: 0, treatsDoorstep: 0 });
    expect(rowTreats('willow', [none]).verdict).toBe('MISS');
  });
});

describe('outcome 4: first Craftsfolk by day 40', () => {
  const days = (first: number): DaySample[] =>
    Array.from({ length: 70 }, (_, i) => ({ day: i + 1, crafts: i + 1 >= first ? 1 : 0, households: 10 }));
  it('reports the day, and passes by 40', () => {
    expect(measureFirstCraftsfolk(days(31))).toBe(31);
    expect(rowFirstCraftsfolk('willow', days(40)).verdict).toBe('PASS');
  });
  it('misses late or never, with the number', () => {
    expect(rowFirstCraftsfolk('willow', days(41))).toMatchObject({ verdict: 'MISS', measured: 'day 41' });
    expect(rowFirstCraftsfolk('willow', days(99)).measured).toBe('none in 70 days');
  });
});

describe('outcome 5: gaps', () => {
  const gap = (o: Partial<SeenGap> & { id: number }): SeenGap => ({
    kind: 'nothingToSell',
    subject: 'p',
    closed: true,
    closers: [1],
    openedDay: 3,
    ...o,
  });
  const kinds = ['nothingToSell', 'nobodyPasses'];

  it('counts opened, closed and credited per kind', () => {
    const m = measureGaps(kinds, [
      gap({ id: 1 }),
      gap({ id: 2, closed: false, closers: [] }),
      gap({ id: 3, kind: 'nobodyPasses', closers: [0, 1] }),
    ]);
    expect(m[0]).toMatchObject({ opened: 2, closed: 1, credited: 1, uncredited: 0 });
    expect(m[1]).toMatchObject({ opened: 1, closed: 1, credited: 2 });
  });

  it('passes a kind that opened, closed and credited, and misses one that never opened', () => {
    const rows = rowsGaps('willow', kinds, [gap({ id: 1 })]);
    expect(rows[0]!.verdict).toBe('PASS');
    expect(rows[1]!.verdict).toBe('MISS');
    expect(rows[1]!.measured).toContain('opened 0');
  });

  it('misses a first closing that credits nobody, but not a repeat of a credited subject', () => {
    const bad = rowsGaps('willow', ['nothingToSell'], [gap({ id: 1, closers: [] })]);
    expect(bad[0]!.verdict).toBe('MISS');
    const repeat = rowsGaps('willow', ['nothingToSell'], [gap({ id: 1 }), gap({ id: 2, closers: [] })]);
    expect(repeat[0]!.verdict).toBe('PASS');
  });
});

describe('outcome 6: carts and evening streets', () => {
  it('loop: passes off the stretch within twice free flow, misses on it or too slow', () => {
    const free = cart({ marked: false });
    expect(rowsCartLoop(cart({ tripTicks: 800 }), free).map((r) => r.verdict)).toEqual(['PASS', 'PASS']);
    expect(rowsCartLoop(cart({ onEveningTiles: 56 }), free)[0]!.verdict).toBe('MISS');
    expect(rowsCartLoop(cart({ tripTicks: 1200 }), free)[1]!.verdict).toBe('MISS');
    expect(rowsCartLoop(cart({ jobTaken: false, tripTicks: -1 }), free).map((r) => r.verdict)).toEqual([
      'MISS',
      'MISS',
    ]);
  });

  it('one road: waits and delivers after 21:00', () => {
    expect(rowCartOneRoad(cart({ deliveredAt: 21.4 })).verdict).toBe('PASS');
    // R2X: past midnight counts on (the scene's long way round delivers at 00:23).
    expect(rowCartOneRoad(cart({ deliveredAt: 24.4, endHour: 26 })).verdict).toBe('PASS');
    expect(rowCartOneRoad(cart({ deliveredAt: 24.4, endHour: 26 })).measured).toContain('delivered 0:24');
    expect(rowCartOneRoad(cart({ deliveredAt: 20.4 })).verdict).toBe('MISS');
    expect(rowCartOneRoad(cart({ deliveredAt: 22, onEveningTiles: 3 })).verdict).toBe('MISS');
    expect(rowCartOneRoad(cart({ tripTicks: -1, deliveredAt: -1, parkedAtEnd: false })).verdict).toBe('MISS');
  });

  it('the scenes run and report a number without throwing', { timeout: 60_000 }, () => {
    const run = runCartScene('loop', true, 19);
    expect(run.scene).toBe('loop');
    expect(typeof run.onEveningTiles).toBe('number');
    expect(run.endHour).toBeCloseTo(19, 0);
    const one = runCartScene('oneRoad', true, 18);
    expect(one.marked).toBe(true);
  });
});

describe('the table', () => {
  it('prints a header, a rule and one line per row', () => {
    const text = formatRows([rowFirstCraftsfolk('willow', [{ day: 3, crafts: 1, households: 4 }])]);
    expect(text.split('\n')).toHaveLength(3);
    expect(text).toContain('PASS');
  });
});
