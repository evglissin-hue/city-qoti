import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { Road, Terrain, treeValue } from '../src/map/layers';
import { canPlaceBuilding } from '../src/rules/building';
import { canPlaceDecor, canPlaceDecorRun, decorRunSegments } from '../src/rules/decor';
import { entranceTiles, footprintSize, footprintTiles } from '../src/rules/footprint';
import { canPaintRoad } from '../src/rules/road';
import { canPlantTree } from '../src/rules/tree';
import { flatWorld, reader, run, S } from './helpers';

const cottage = content.buildingById.get('cottage')!;
const house = content.buildingById.get('house')!;
const bench = content.decorById.get('bench')!;
const fence = content.decorById.get('fence')!;
const flowerBed = content.decorById.get('flower-bed')!;
const lantern = content.decorById.get('lantern')!;

/** Fixed point center of a tile. */
const fp = (t: number) => t * 256 + 128;

describe('footprints', () => {
  it('swaps width and depth on odd rotations', () => {
    expect(footprintSize(house, 0)).toEqual([2, 3]);
    expect(footprintSize(house, 1)).toEqual([3, 2]);
    expect(footprintTiles(house, 10, 10, 1)).toHaveLength(6);
  });

  it('puts the entrance on the facing side', () => {
    // House 2 x 3, entrance (1, 2) at rotation 0, facing south.
    expect(entranceTiles(house, 10, 10, 0)).toEqual({ entrance: [11, 12], front: [11, 13] });
    expect(entranceTiles(house, 10, 10, 1).front[0]).toBe(9); // faces west
    expect(entranceTiles(house, 10, 10, 2).front[1]).toBe(9); // faces north
    expect(entranceTiles(house, 10, 10, 3).front[0]).toBe(13); // faces east
  });
});

describe('canPlaceBuilding', () => {
  it('accepts open grass and warns without a road', () => {
    const r = canPlaceBuilding(reader(flatWorld()), cottage, 50, 50, 0);
    expect(r.ok).toBe(true);
    expect(r.tiles).toHaveLength(4);
    expect(r.foundation).toBe(false);
    expect(r.warnings).toEqual(['NO_ROAD']);
  });

  it('drops the warning when the entrance faces a road', () => {
    const w = flatWorld();
    w.map.road[52 * S + 51] = Road.path; // in front of entrance (51, 51)
    expect(canPlaceBuilding(reader(w), cottage, 50, 50, 0).warnings).toEqual([]);
  });

  it('reports each rule with its reason code', () => {
    const w = flatWorld();
    const r = reader(w);
    expect(canPlaceBuilding(r, cottage, -1, 50, 0).reason).toBe('OUT_OF_BOUNDS');
    expect(canPlaceBuilding(r, cottage, S - 1, 50, 0).reason).toBe('OUT_OF_BOUNDS');
    expect(canPlaceBuilding(r, cottage, 99, 50, 0).reason).toBe('WATER');
    expect(canPlaceBuilding(r, cottage, 29, 25, 0).reason).toBe('TOO_STEEP');
    expect(canPlaceBuilding(r, cottage, 50, 50, 5 as never).reason).toBe('INVALID');
    w.map.road[60 * S + 60] = Road.lane;
    expect(canPlaceBuilding(r, cottage, 59, 59, 0).reason).toBe('OCCUPIED');
  });

  it('adds a foundation on a one-level slope', () => {
    const w = flatWorld();
    w.map.height[50 * S + 50] = 3;
    const r = canPlaceBuilding(reader(w), cottage, 50, 50, 0);
    expect(r.ok).toBe(true);
    expect(r.foundation).toBe(true);
  });

  it('will not swallow decor or overlap another building', () => {
    const w = flatWorld();
    run(w, { t: 'decor.place', def: 'bench', fx: fp(70), fz: fp(70), rot: 0 });
    expect(canPlaceBuilding(reader(w), cottage, 69, 69, 0).reason).toBe('OCCUPIED');
    run(w, { t: 'build.place', def: 'cottage', x: 80, z: 80, rot: 0 });
    expect(canPlaceBuilding(reader(w), cottage, 81, 81, 0).reason).toBe('OCCUPIED');
    expect(canPlaceBuilding(reader(w), cottage, 82, 80, 0).ok).toBe(true);
  });

  it('allows trees in the footprint (sandbox clears them)', () => {
    const w = flatWorld();
    w.map.tree[50 * S + 50] = treeValue(1, 3);
    expect(canPlaceBuilding(reader(w), cottage, 50, 50, 0).ok).toBe(true);
  });
});

describe('canPaintRoad', () => {
  it('accepts a run over grass', () => {
    expect(
      canPaintRoad(reader(flatWorld()), 'path', [
        [50, 50],
        [51, 50],
        [52, 50],
      ]).ok,
    ).toBe(true);
  });

  it('rejects the whole run at the first bad tile', () => {
    const r = canPaintRoad(reader(flatWorld()), 'path', [
      [98, 50],
      [99, 50],
      [100, 50],
      [101, 50],
    ]);
    expect(r).toEqual({ ok: false, reason: 'WATER', firstBadTile: [100, 50] });
  });

  it('rejects cliffs between neighbors, buildings, decor and bad input', () => {
    const w = flatWorld();
    expect(
      canPaintRoad(reader(w), 'path', [
        [19, 22],
        [20, 22],
      ]).reason,
    ).toBe('TOO_STEEP');
    run(w, { t: 'build.place', def: 'well', x: 60, z: 60, rot: 0 });
    expect(canPaintRoad(reader(w), 'lane', [[60, 60]]).reason).toBe('OCCUPIED');
    run(w, { t: 'decor.place', def: 'flower-bed', fx: fp(65), fz: fp(65), rot: 0 });
    expect(canPaintRoad(reader(w), 'path', [[65, 65]]).reason).toBe('OCCUPIED');
    run(w, { t: 'decor.place', def: 'lantern', fx: fp(66), fz: fp(66), rot: 0 });
    expect(canPaintRoad(reader(w), 'path', [[66, 66]]).ok).toBe(true);
    expect(canPaintRoad(reader(w), 'path', []).reason).toBe('INVALID');
    expect(canPaintRoad(reader(w), 'street' as never, [[1, 1]]).reason).toBe('INVALID');
    const many = Array.from({ length: 257 }, (_, i) => [i % 90, 10] as [number, number]);
    expect(canPaintRoad(reader(w), 'path', many).reason).toBe('TOO_MANY');
    expect(canPaintRoad(reader(w), 'path', [[-1, 3]]).reason).toBe('OUT_OF_BOUNDS');
  });
});

describe('canPlaceDecor', () => {
  it('accepts open grass and keeps decor apart', () => {
    const w = flatWorld();
    expect(canPlaceDecor(reader(w), bench, fp(50), fp(50), 0).ok).toBe(true);
    run(w, { t: 'decor.place', def: 'bench', fx: fp(50), fz: fp(50), rot: 0 });
    // 0.8 * (48 + 48) = 76.8: 76 units away is too close, 80 is fine.
    expect(canPlaceDecor(reader(w), bench, fp(50) + 76, fp(50), 0).reason).toBe('OCCUPIED');
    expect(canPlaceDecor(reader(w), bench, fp(50) + 80, fp(50), 0).ok).toBe(true);
  });

  it('keeps a margin from buildings and stays off water', () => {
    const w = flatWorld();
    run(w, { t: 'build.place', def: 'well', x: 60, z: 60, rot: 0 });
    // Well covers x 15360..15616; bench radius 48 + margin 32 = 80.
    expect(canPlaceDecor(reader(w), bench, 60 * 256 - 79, fp(60), 0).reason).toBe('OCCUPIED');
    expect(canPlaceDecor(reader(w), bench, 60 * 256 - 81, fp(60), 0).ok).toBe(true);
    expect(canPlaceDecor(reader(w), bench, 100 * 256 - 20, fp(60), 0).reason).toBe('WATER');
  });

  it('only allows onRoad decor on paths and lanes, and only open ground otherwise', () => {
    const w = flatWorld();
    w.map.road[70 * S + 70] = Road.path;
    expect(canPlaceDecor(reader(w), flowerBed, fp(70), fp(70), 0).reason).toBe('NOT_ALLOWED');
    expect(canPlaceDecor(reader(w), lantern, fp(70), fp(70), 0).ok).toBe(true);
    w.map.terrain[71 * S + 71] = Terrain.forestFloor;
    expect(canPlaceDecor(reader(w), bench, fp(71), fp(71), 0).reason).toBe('NOT_ALLOWED');
    w.map.tree[72 * S + 72] = treeValue(1, 3);
    expect(canPlaceDecor(reader(w), bench, fp(72), fp(72), 0).reason).toBe('OCCUPIED');
    expect(canPlaceDecor(reader(w), bench, fp(73), fp(73), 64).reason).toBe('INVALID');
    expect(canPlaceDecor(reader(w), bench, -5, fp(73), 0).reason).toBe('OUT_OF_BOUNDS');
  });
});

describe('linear decor runs', () => {
  it('splits a line into 1-tile segments aligned to it', () => {
    const segs = decorRunSegments([fp(10), fp(10)], [fp(14), fp(10)]);
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.rot)).toEqual([0, 0, 0, 0]);
    expect(segs[0]!.fx).toBe(fp(10) + 128);
    const down = decorRunSegments([fp(10), fp(10)], [fp(10), fp(13)]);
    expect(down.every((s) => s.rot === 16)).toBe(true);
    expect(decorRunSegments([fp(1), fp(1)], [fp(1), fp(1)])).toHaveLength(1);
  });

  it('validates every segment', () => {
    const w = flatWorld();
    expect(canPlaceDecorRun(reader(w), fence, [fp(90), fp(40)], [fp(96), fp(40)]).ok).toBe(true);
    expect(canPlaceDecorRun(reader(w), fence, [fp(95), fp(40)], [fp(103), fp(40)]).reason).toBe('WATER');
    expect(canPlaceDecorRun(reader(w), bench, [fp(90), fp(40)], [fp(96), fp(40)]).reason).toBe('NOT_ALLOWED');
    expect(canPlaceDecorRun(reader(w), fence, [fp(0), fp(40)], [fp(80), fp(40)]).reason).toBe('TOO_MANY');
  });
});

describe('canPlantTree', () => {
  it('needs an empty plantable tile', () => {
    const w = flatWorld();
    expect(canPlantTree(reader(w), 50, 50).ok).toBe(true);
    expect(canPlantTree(reader(w), 100, 50).reason).toBe('WATER');
    w.map.road[51 * S + 51] = Road.path;
    expect(canPlantTree(reader(w), 51, 51).reason).toBe('OCCUPIED');
    w.map.terrain[52 * S + 52] = Terrain.sand;
    expect(canPlantTree(reader(w), 52, 52).reason).toBe('NOT_ALLOWED');
    w.map.tree[53 * S + 53] = treeValue(2, 0);
    expect(canPlantTree(reader(w), 53, 53).reason).toBe('OCCUPIED');
    expect(canPlantTree(reader(w), S, 0).reason).toBe('OUT_OF_BOUNDS');
  });
});

describe('LOCKED_PARCEL', () => {
  it('rejects every kind of placement on a locked parcel (fixture reader)', () => {
    const base = reader(flatWorld());
    const locked = { ...base, parcelUnlocked: (x: number, z: number) => x < 40 && base.parcelUnlocked(x, z) };
    expect(canPlaceBuilding(locked, cottage, 50, 50, 0).reason).toBe('LOCKED_PARCEL');
    expect(canPaintRoad(locked, 'path', [[50, 50]]).reason).toBe('LOCKED_PARCEL');
    expect(canPlantTree(locked, 50, 50).reason).toBe('LOCKED_PARCEL');
    expect(canPlaceDecor(locked, bench, fp(50), fp(50), 0).reason).toBe('LOCKED_PARCEL');
    expect(canPlaceBuilding(locked, cottage, 20, 20, 0).ok).toBe(true);
  });
});

describe('bridges', () => {
  const river = (w: number) => {
    const world = flatWorld();
    // Low banks (height 1) on both sides of a w-wide river running north to south.
    for (let x = 56; x < 64 + w; x++) for (let z = 0; z < S; z++) world.map.height[z * S + x] = 1;
    for (let x = 60; x < 60 + w; x++) {
      for (let z = 0; z < S; z++) {
        world.map.water[z * S + x] = 1;
        world.map.terrain[z * S + x] = Terrain.water;
        world.map.height[z * S + x] = 0;
      }
    }
    return world;
  };
  const line = (from: number, to: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let x = from; x <= to; x++) out.push([x, 50]);
    return out;
  };

  it('crosses up to six water tiles with low land at both ends', () => {
    expect(canPaintRoad(reader(river(6)), 'path', line(58, 67)).ok).toBe(true);
  });

  it('rejects a seventh water tile, a dangling end, or high banks', () => {
    expect(canPaintRoad(reader(river(7)), 'path', line(58, 68)).reason).toBe('WATER');
    const dangling = canPaintRoad(reader(river(3)), 'path', line(58, 61));
    expect(dangling.reason).toBe('WATER');
    expect(dangling.firstBadTile).toEqual([60, 50]);
    const high = river(3);
    high.map.height[50 * S + 59] = 2;
    expect(canPaintRoad(reader(high), 'path', line(58, 64)).ok).toBe(false);
  });
});
