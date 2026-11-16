// R2E: rowsOf reads street lots (hand-made lots, no autoplay) and the outcome row that judges them.
import { describe, expect, it } from 'vitest';
import type { Lot } from '@qoti/sim';
import { rowStreetRows } from './outcomes';
import { NO_ROWS, rowsOf } from './rows';

const lot = (id: number, over: Partial<Lot> = {}): Lot => ({
  id,
  zone: 3,
  x: id * 2,
  z: 0,
  w: 2,
  d: 3,
  rot: 0,
  frontage: 0,
  desirability: 0,
  style: '',
  buildingId: 0,
  tick: 0,
  row: 0,
  kind: 'plot',
  ...over,
});

describe('rowsOf', () => {
  it('counts row lots, distinct rows, gardens, corners and grown row lots', () => {
    const lots = [
      lot(1, { row: 10, buildingId: 7 }),
      lot(2, { row: 10, corner: true, frontage2: 5 }),
      lot(3, { row: 10 }),
      lot(4, { row: 11 }),
      lot(5, { row: 11, buildingId: 8 }),
      lot(6, { zone: 0, kind: 'garden' }),
      lot(7, { zone: 0, kind: 'garden' }),
      lot(8), // a lane lot: no row
    ];
    expect(rowsOf({ lots })).toEqual({
      rowLots: 5,
      rows: 2,
      longestRow: 3,
      rowsOf3: 1,
      gardens: 2,
      corners: 1,
      grownRowLots: 2,
    });
  });

  it('reads zero in a town with no streets, and the outcome MISSes with its number', () => {
    expect(rowsOf({ lots: [lot(1), lot(2)] })).toEqual(NO_ROWS);
    const miss = rowStreetRows('willow', NO_ROWS);
    expect(miss.verdict).toBe('MISS');
    expect(miss.measured).toContain('0 row lots');
  });

  it('passes with a row of three and a garden', () => {
    const lots = [
      lot(1, { row: 4 }),
      lot(2, { row: 4 }),
      lot(3, { row: 4 }),
      lot(4, { kind: 'garden', zone: 0 }),
    ];
    expect(rowStreetRows('oak', rowsOf({ lots })).verdict).toBe('PASS');
    expect(rowStreetRows('oak', rowsOf({ lots: lots.slice(0, 3) })).verdict).toBe('MISS');
  });
});
