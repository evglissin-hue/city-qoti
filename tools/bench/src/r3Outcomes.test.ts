import { describe, expect, it } from 'vitest';
import type { EveningSample, R3DaySample, R3Record, SeenGap } from './outcomes';
import { EMPTY_R3, healthByKind } from './outcomes';
import { newcomerNote, profileOptions, seedLabel } from './profile';
import {
  DAYS_IN_YEAR,
  NO_CANDLES,
  r3GapKinds,
  rowCandles,
  rowDeparted,
  rowEveningGoal,
  rowFirstMaster,
  rowMasterShelf,
  rowsFourthGap,
  rowTavernTreats,
  rowTownBook,
  runPool,
  type CandlesRun,
} from './r3Outcomes';

const day = (o: Partial<R3DaySample> = {}): R3DaySample => ({
  day: 70,
  residents: 100,
  households: 40,
  crafts: 10,
  leanTimes: false,
  masters: 0,
  byTrade: [],
  mastersMade: 0,
  masterShelf: 0,
  masterMade: 0,
  masterUsed: 0,
  pages: 0,
  specialties: 0,
  customs: 0,
  seat0: 0,
  seat1: 0,
  together: 0,
  callings: 0,
  treats: 5,
  treasury: 0,
  owed: 0,
  creditLine: 2000,
  ...o,
});

const r3 = (o: Partial<R3Record> = {}): R3Record => ({ ...EMPTY_R3, days: [day()], ...o });

const gap = (o: Partial<SeenGap> = {}): SeenGap => ({
  id: 1,
  kind: 'shortOfSupplies',
  subject: 'place:a',
  closed: true,
  closers: [0],
  openedDay: 30,
  ...o,
});

const eve = (o: Partial<EveningSample> = {}): EveningSample => ({
  day: 1,
  weather: 'fair',
  eligible: 10,
  out: 8,
  outAny: 8,
  places: 3,
  treatsAtStops: 0,
  treatsPassing: 0,
  treatsDoorstep: 0,
  ...o,
});

const candles = (o: Partial<CandlesRun> = {}): CandlesRun => ({
  ...NO_CANDLES,
  lanterns: 64,
  need: 16,
  candlesSet: 8,
  covers: 32,
  lit: 32,
  resting: 32,
  keptPlace: 'site:lantern-walk:1',
  keptLanterns: 19,
  keptLit: 19,
  ...o,
});

describe('profiles', () => {
  it('names the seed column and the options', () => {
    expect(seedLabel('willow', 'tuned')).toBe('willow');
    expect(seedLabel('willow', 'newcomer')).toBe('willow/newcomer');
    expect(profileOptions('tuned')).toEqual({});
    expect(profileOptions('newcomer')).toEqual({ newcomer: true });
    expect(newcomerNote()).toContain('newcomer profile');
  });
});

describe('row 1: candles for half', () => {
  it('passes when the kept place is lit, lit equals what stock covers and the rest rest', () => {
    expect(rowCandles('willow', candles()).verdict).toBe('PASS');
  });
  it('misses on the stand-in, where every lantern is lit', () => {
    const row = rowCandles('willow', candles({ lit: 64, resting: 0 }));
    expect(row.verdict).toBe('MISS');
    expect(row.measured).toContain('64 of 64 lanterns lit');
    expect(row.needs).toContain('R3A');
  });
  it('misses when the kept place is not lit first, when money leaks, when it threw or was never set', () => {
    expect(rowCandles('s', candles({ keptLit: 3 })).verdict).toBe('MISS');
    expect(rowCandles('s', candles({ moneyLeak: 5 })).verdict).toBe('MISS');
    expect(rowCandles('s', candles({ threw: 'boom' })).measured).toContain('boom');
    expect(rowCandles('s', { ...NO_CANDLES, skipped: 'no lanterns stand' }).measured).toContain(
      'no lanterns',
    );
  });
});

describe('rows 2 and 3: masters', () => {
  it('passes a master within a year of the claim', () => {
    expect(rowFirstMaster('s', r3({ villageDay: 19, firstMasterDay: 30 }), 70).verdict).toBe('PASS');
    const late = r3({ villageDay: 19, firstMasterDay: 19 + DAYS_IN_YEAR + 1 });
    expect(rowFirstMaster('s', late, 70).verdict).toBe('MISS');
  });
  it('misses no master after a full year, and is n/a before one has passed or with no claim', () => {
    expect(rowFirstMaster('s', r3({ villageDay: 19 }), 70).verdict).toBe('MISS');
    expect(rowFirstMaster('s', r3({ villageDay: 60 }), 70).verdict).toBe('N/A');
    expect(rowFirstMaster('s', r3(), 70).verdict).toBe('N/A');
  });
  it("a master's good reaches a shelf or misses", () => {
    expect(rowMasterShelf('s', r3({ firstShelfDay: 40 })).verdict).toBe('PASS');
    const miss = rowMasterShelf('s', r3());
    expect(miss.verdict).toBe('MISS');
    expect(miss.measured).toContain('no master made');
  });
});

describe('row 4: a departed master', () => {
  const dep = { trade: 'baker', good: 'pies', mastersAfter: 0, madeLastDay: 0 };
  it('passes when the good stops, misses when it goes on', () => {
    expect(rowDeparted('s', dep).verdict).toBe('PASS');
    expect(rowDeparted('s', { ...dep, madeLastDay: 4 }).verdict).toBe('MISS');
  });
  it('is n/a with no master, or one who had not gone', () => {
    expect(rowDeparted('s', { ...dep, skipped: 'no master made' }).verdict).toBe('N/A');
    expect(rowDeparted('s', { ...dep, mastersAfter: 1, madeLastDay: 3 }).verdict).toBe('N/A');
  });
});

describe('row 5: the Town Book', () => {
  it('needs six pages, both seats and a calling', () => {
    const ok = day({ pages: 6, seat0: 4, seat1: 3, callings: 1, together: 1 });
    expect(rowTownBook('s', r3({ days: [ok] })).verdict).toBe('PASS');
    expect(rowTownBook('s', r3({ days: [{ ...ok, seat1: 0 }] })).verdict).toBe('MISS');
    expect(rowTownBook('s', r3({ days: [{ ...ok, pages: 5 }] })).verdict).toBe('MISS');
    expect(rowTownBook('s', r3({ days: [{ ...ok, callings: 0 }] })).verdict).toBe('MISS');
    expect(rowTownBook('s', r3({ days: [] })).verdict).toBe('MISS');
  });
});

describe('rows 6 and 7: gaps', () => {
  it('reads the R3 kind from content', () => {
    expect(r3GapKinds()).toEqual(['shortOfSupplies']);
  });
  it('the fourth gap opens, closes and credits, or misses', () => {
    expect(rowsFourthGap('s', [gap()])[0]!.verdict).toBe('PASS');
    expect(rowsFourthGap('s', [gap({ closed: false, closers: [] })])[0]!.verdict).toBe('MISS');
    expect(rowsFourthGap('s', [gap({ closers: [] })])[0]!.verdict).toBe('MISS');
    expect(rowsFourthGap('s', [])[0]!.measured).toContain('opened 0');
  });
  it("the tavern's Treats needs a tavern and a gap that opens and closes", () => {
    const g = gap({ kind: 'nothingToSell' });
    expect(rowTavernTreats('s', r3({ tavernDay: 25 }), [g]).verdict).toBe('PASS');
    expect(rowTavernTreats('s', r3({ tavernDay: 25 }), [{ ...g, closed: false }]).verdict).toBe('MISS');
    expect(rowTavernTreats('s', r3(), [g]).verdict).toBe('N/A');
  });
});

describe('row 8: the evening goal', () => {
  it('passes at the floors and misses below either', () => {
    const fair = (d: number, out: number) => eve({ day: d, out });
    expect(rowEveningGoal('s', [fair(1, 8), fair(2, 9), fair(3, 5), fair(4, 10)]).verdict).toBe('PASS');
    expect(rowEveningGoal('s', [fair(1, 8), fair(2, 4)]).verdict).toBe('MISS');
    expect(rowEveningGoal('s', [fair(1, 7), fair(2, 7)]).verdict).toBe('MISS');
    expect(rowEveningGoal('s', []).verdict).toBe('MISS');
  });

  it("holds each bench seed to its own evening before R3, and only reports the newcomer's", () => {
    // willow's baseline is 54% worst: a 50% worst evening falls below it, though above the 48% floor.
    const fair = (d: number, out: number) => eve({ day: d, out });
    const evenings = [fair(1, 5), fair(2, 9), fair(3, 10), fair(4, 10)];
    expect(rowEveningGoal('s', evenings).verdict).toBe('PASS');
    expect(rowEveningGoal('willow', evenings).verdict).toBe('MISS');
    expect(rowEveningGoal('willow/newcomer', evenings).verdict).toBe('N/A');
  });
});

describe('helpers', () => {
  it('counts health issues by kind as strings', () => {
    const issues = [
      { kind: 'hands-spiral' as never },
      { kind: 'hands-spiral' as never },
      { kind: 'site-stalled' as const },
    ];
    expect(healthByKind(issues)).toEqual({ 'hands-spiral': 2, 'site-stalled': 1 });
  });
  it('runs a pool in order', async () => {
    const out = await runPool(
      [1, 2, 3, 4].map((n) => () => Promise.resolve(n * 2)),
      2,
    );
    expect(out).toEqual([2, 4, 6, 8]);
  });
});
