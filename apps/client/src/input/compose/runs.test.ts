import { content } from '@qoti/content';
import { TILE_FP } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { reader, rejection, run } from '../../../../../packages/sim/test/helpers';
import { decor, road, rowRun, standardWorld } from '../../../../../packages/sim/test/hearth/helpers';
import { dragTiles, flowerPieces, lanternPieces, runWithGaps } from './runs';

const c = (t: number) => t * TILE_FP + TILE_FP / 2;
const lantern = content.decorById.get('lantern')!;
const flower = content.decorById.get('flower-bed')!;
const hedge = content.decorById.get('hedge')!;
const fence = content.decorById.get('fence')!;
const tileOf = (f: number) => Math.floor(f / TILE_FP);

describe('a click and a drag', () => {
  it('a drag is 2 or more tiles', () => {
    expect(dragTiles([c(10), c(10)], [c(10), c(10)])).toBe(0);
    expect(dragTiles([c(10), c(10)], [c(11), c(10)])).toBe(1);
    expect(dragTiles([c(10), c(10)], [c(12), c(11)])).toBe(2);
  });
});

describe('a dragged run of lanterns', () => {
  it('stands every third tile on alternating sides of the path', () => {
    const w = standardWorld();
    road(w, 'path', 38, 50, 60, 50);
    const pieces = lanternPieces(reader(w), lantern, [c(40), c(50)], [c(49), c(50)]);
    expect(pieces.map((p) => tileOf(p.fx))).toEqual([40, 43, 46, 49]);
    expect(pieces.map((p) => Math.sign(p.fz - c(50)))).toEqual([1, -1, 1, -1]);
    // Half a tile and a hair to the side, so every one clears the path tile.
    for (const p of pieces) {
      expect(Math.abs(p.fz - c(50))).toBeGreaterThanOrEqual(TILE_FP / 2);
      expect(w.map.road[tileOf(p.fz) * reader(w).size + tileOf(p.fx)]).toBe(0);
    }
  });

  it('skips a spot that fails and still lands the rest, and the sim takes it as one command', () => {
    const w = standardWorld();
    road(w, 'path', 38, 50, 60, 50);
    const size = reader(w).size;
    // The third lantern's tile is taken (the side it would stand on).
    w.map.occupant[49 * size + 46] = 1;
    w.map.occupant[51 * size + 46] = 1;
    const pieces = lanternPieces(reader(w), lantern, [c(40), c(50)], [c(49), c(50)]);
    expect(pieces.map((p) => tileOf(p.fx))).toEqual([40, 43, 49]);
    const ctx = run(w, {
      t: 'decor.placeRun',
      def: 'lantern',
      from: [c(40), c(50)],
      to: [c(49), c(50)],
      pieces,
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(w.decor).toHaveLength(3);
  });
});

describe('a dragged run of flowers', () => {
  it('follows a wall, one on every tile of the drag', () => {
    const w = standardWorld();
    rowRun(w, 'low-wall', 40, 48, 50);
    const pieces = flowerPieces(reader(w), flower, [c(40), c(51)], [c(48), c(51)]);
    expect(pieces.map((p) => tileOf(p.fx))).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48]);
    expect(pieces.every((p) => p.fz === c(51))).toBe(true);
  });

  it('dragged along a path, stands beside it rather than on it', () => {
    const w = standardWorld();
    road(w, 'path', 38, 50, 60, 50);
    const pieces = flowerPieces(reader(w), flower, [c(40), c(50)], [c(48), c(50)]);
    expect(pieces).toHaveLength(9);
    for (const p of pieces) expect(w.map.road[tileOf(p.fz) * reader(w).size + tileOf(p.fx)]).toBe(0);
  });
});

describe('runs meet roads gracefully', () => {
  const from: [number, number] = [c(40), c(50)];
  const to: [number, number] = [c(50), c(50)];

  it('a hedge across a path leaves an opening, and the sim takes the pieces', () => {
    const w = standardWorld();
    road(w, 'path', 45, 40, 45, 60);
    // As the plain run the sim refuses it, as before.
    expect(rejection(run(standardWorld(), { t: 'decor.placeRun', def: 'hedge', from, to }))).toBeUndefined();
    const gapped = runWithGaps(reader(w), hedge, from, to);
    expect(gapped.dropped).toBe(1);
    expect(gapped.check.ok).toBe(true);
    expect(gapped.segments).toHaveLength(9);
    expect(gapped.segments.some((s) => tileOf(s.fx) === 45)).toBe(false);
    expect(rejection(run(w, { t: 'decor.placeRun', def: 'hedge', from, to }))).toBeDefined();
    const ctx = run(w, { t: 'decor.placeRun', def: 'hedge', from, to, pieces: gapped.segments });
    expect(rejection(ctx)).toBeUndefined();
    expect(w.decor).toHaveLength(9);
  });

  it('a fence across a road gets a gate opening too; with no road it is the plain run', () => {
    const w = standardWorld();
    road(w, 'lane', 45, 40, 45, 60);
    expect(runWithGaps(reader(w), fence, from, to).dropped).toBe(1);
    const free = runWithGaps(reader(standardWorld()), fence, from, to);
    expect(free.dropped).toBe(0);
    expect(free.check.ok).toBe(true);
    expect(free.segments).toHaveLength(10);
  });

  it('a run that is all road has nothing to place', () => {
    const w = standardWorld();
    road(w, 'path', 40, 50, 50, 50);
    expect(runWithGaps(reader(w), hedge, from, to).check.ok).toBe(false);
  });

  it('still refuses a run over other decor for the usual reasons', () => {
    const w = standardWorld();
    road(w, 'path', 45, 40, 45, 60);
    decor(w, 'barrels', 0, 0, 0, { fx: 47 * TILE_FP, fz: c(50) });
    expect(runWithGaps(reader(w), hedge, from, to).check.ok).toBe(false);
  });
});
