import { describe, expect, it } from 'vitest';
import { EMPTY_R3, type EveningSample, type NightSample, type R3DaySample, type RunRecord } from './outcomes';
import { NO_ROWS } from './rows';
import { formatReport, healthText, summarize, TREATS_FROM_DAY } from './r3Report';

const day = (d: number, o: Partial<R3DaySample> = {}): R3DaySample => ({
  day: d,
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
  treats: 0,
  treasury: 0,
  owed: 1800,
  creditLine: 2000,
  ...o,
});

const night = (o: Partial<NightSample> = {}): NightSample => ({
  day: 40,
  season: 0,
  rank: 'village',
  standing: 10,
  lit: 10,
  resting: 0,
  drawn: { candles: 0, firewood: 0, cloth: 0 },
  ...o,
});

const eve = (d: number, out: number): EveningSample => ({
  day: d,
  weather: 'fair',
  eligible: 10,
  out,
  outAny: out,
  places: 3,
  treatsAtStops: 0,
  treatsPassing: 0,
  treatsDoorstep: 0,
});

const rec = (): RunRecord => ({
  seed: 'willow',
  days: 70,
  evenings: [eve(40, 8), eve(41, 6)],
  rooms: [],
  daySamples: [],
  gaps: [],
  rows: { ...NO_ROWS, gardens: 2 },
  r3: {
    ...EMPTY_R3,
    days: [
      day(10, { treats: 99, leanTimes: true }),
      day(TREATS_FROM_DAY, { treats: 2, leanTimes: true }),
      day(50, { treats: 6 }),
      day(70, { treats: 4, crafts: 14, households: 40, masters: 2, mastersMade: 3, pages: 6, callings: 1 }),
    ],
    nights: [
      night({ rank: 'hamlet', lit: 0 }),
      night({ lit: 10 }),
      night({ season: 3, lit: 5 }),
      night({ season: 3, standing: 0, lit: 0 }),
    ],
    firstClimb: { day: 44, def: 'windmill', level: 2 },
    firstMasterDay: 51,
    health: { 'meals-missed': 3, 'hands-spiral': 1 },
    decisions: { ledger: 90, hearth: 300, refused: 20 },
  },
});

describe('summarize', () => {
  const row = summarize(rec(), 'tuned');
  it('reads the evening goal', () => {
    expect(row.worst).toBeCloseTo(0.6);
    expect(row.worstDay).toBe(41);
    expect(row.mean).toBeCloseTo(0.7);
  });
  it('counts Treats from day 30 only, and lean days over the whole run', () => {
    expect([row.treatsMin, row.treatsMax, row.treatsEnd]).toEqual([2, 6, 4]);
    expect(row.treatsMean).toBeCloseTo(4);
    expect(row.leanDays).toBe(2);
  });
  it('reads Craftsfolk, masters, pages and the climb at the end of the run', () => {
    expect(row.craftsShare).toBeCloseTo(0.35);
    expect([row.firstMaster, row.masters, row.mastersMade, row.pages, row.callings]).toEqual([
      51, 2, 3, 6, 1,
    ]);
    expect(row.climb).toEqual({ day: 44, def: 'windmill', level: 2 });
    expect(row.gardens).toBe(2);
  });
  it('shares lit lanterns from Village rank, nights with no lantern left out', () => {
    expect(row.nightsAll).toBe(2);
    expect(row.litAll).toBeCloseTo(0.75);
    expect(row.nightsWinter).toBe(1);
    expect(row.litWinter).toBeCloseTo(0.5);
  });
  it('reads the debt per resident against the credit line', () => {
    expect(row.owedPerResident).toBeCloseTo(18);
    expect(row.creditLine).toBe(2000);
  });
  it('is null with no lantern night, and zero with no fair evening', () => {
    const empty = summarize({ ...rec(), evenings: [], r3: { ...EMPTY_R3 } }, 'newcomer');
    expect(empty.litAll).toBeNull();
    expect(empty.worst).toBe(0);
    expect(empty.treatsMin).toBe(0);
  });
});

describe('formatReport', () => {
  it('prints a legend, a header and a row per seed and profile, each under 150 columns', () => {
    const text = formatReport([summarize(rec(), 'tuned'), summarize(rec(), 'newcomer')], 70);
    const lines = text.split('\n');
    expect(lines[0]).toContain('R3 report, 70 days');
    expect(text).toContain('willow/newcomer');
    expect(text).toContain('hands-spiral:1,meals-missed:3');
    const table = lines.slice(lines.findIndex((l) => l.startsWith('seed            worst')));
    expect(table).toHaveLength(3);
    for (const l of table) expect(l.replace(/ \S*$/, '').length).toBeLessThanOrEqual(150);
    for (const l of lines.slice(0, lines.indexOf(''))) expect(l.length).toBeLessThanOrEqual(150);
  });
  it('says none when no health issue was seen', () => {
    expect(healthText({})).toBe('none');
  });
});
