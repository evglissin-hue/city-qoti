import { describe, expect, it } from 'vitest';
import { proposeRoute } from './route';

describe('road route proposals', () => {
  it('is a single tile when start and end match', () => {
    expect(proposeRoute([4, 4], [4, 4])).toEqual([[4, 4]]);
  });

  it('runs straight along a row or column, in either direction', () => {
    expect(proposeRoute([2, 5], [5, 5])).toEqual([
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    expect(proposeRoute([7, 9], [7, 6])).toEqual([
      [7, 9],
      [7, 8],
      [7, 7],
      [7, 6],
    ]);
  });

  it('bends once, along the longer leg first, with no gaps or repeats', () => {
    const route = proposeRoute([0, 0], [4, -2]);
    expect(route[0]).toEqual([0, 0]);
    expect(route[route.length - 1]).toEqual([4, -2]);
    expect(route[4]).toEqual([4, 0]);
    expect(route).toHaveLength(7);
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1]!;
      const [bx, bz] = route[i]!;
      expect(Math.abs(ax - bx) + Math.abs(az - bz)).toBe(1);
    }
    expect(proposeRoute([0, 0], [1, 5])[1]).toEqual([0, 1]);
  });

  it('stops at the sim limit of 256 tiles', () => {
    expect(proposeRoute([0, 0], [300, 300])).toHaveLength(256);
  });
});
