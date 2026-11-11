// R1B: the five site rules of specialized buildings, checked by canPlaceBuilding (the sim and the
// client ghost run this one function), and the valley road they lean on.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { MapReader, WorldState } from '../../src/contracts';
import { Road, TREE_SPECIES, treeValue, Water } from '../../src/map/layers';
import { canPlaceBuilding } from '../../src/rules/building';
import { entranceTiles } from '../../src/rules/footprint';
import { valleyRoadTiles } from '../../src/rules/valleyRoad';
import { insertBuilding } from '../../src/state/place';
import { flatWorld, reader, rejection, run, S } from '../helpers';

const def = (id: string) => content.buildingById.get(id)!;
const mature = treeValue(TREE_SPECIES.oak, 3);

function check(state: WorldState, id: string, x: number, z: number) {
  return canPlaceBuilding(reader(state), def(id), x, z, 0);
}

describe('woods', () => {
  it('needs twelve mature trees within eight tiles, saplings do not count', () => {
    const s = flatWorld();
    expect(check(s, 'foresters-lodge', 60, 60).reason).toBe('NEEDS_WOODS');
    for (let x = 56; x < 68; x++) s.map.tree[66 * S + x] = mature;
    expect(check(s, 'foresters-lodge', 60, 60).ok).toBe(true);
    s.map.tree[66 * S + 57] = treeValue(TREE_SPECIES.oak, 2);
    expect(check(s, 'foresters-lodge', 60, 60).reason).toBe('NEEDS_WOODS');
  });

  it('measures the distance from the footprint, not its corner', () => {
    const s = flatWorld();
    // Twelve trees 9 tiles past the footprint's last row: out of range; 5 tiles: in.
    const rows = def('foresters-lodge').size[1];
    const lastRow = 60 + rows - 1;
    for (let x = 56; x < 68; x++) s.map.tree[(lastRow + 9) * S + x] = mature;
    expect(check(s, 'foresters-lodge', 60, 60).reason).toBe('NEEDS_WOODS');
    for (let x = 56; x < 68; x++) {
      s.map.tree[(lastRow + 9) * S + x] = 0;
      s.map.tree[(lastRow + 5) * S + x] = mature;
    }
    expect(check(s, 'foresters-lodge', 60, 60).ok).toBe(true);
  });
});

describe('river', () => {
  it('needs river water at a footprint tile or beside it; ponds do not count', () => {
    const s = flatWorld();
    // The flat world's river is x 100 and 101.
    const sawmill = def('sawmill');
    expect(check(s, 'sawmill', 60, 60).reason).toBe('NEEDS_RIVER');
    expect(check(s, 'sawmill', 100 - sawmill.size[0], 60).ok).toBe(true);
    // A pond beside the footprint is not the river.
    for (let z = 58; z < 66; z++) s.map.water[z * S + 70] = Water.pond;
    expect(check(s, 'sawmill', 70 - sawmill.size[0], 60).reason).toBe('NEEDS_RIVER');
  });
});

describe('openGround', () => {
  it('refuses a building within two tiles and accepts it on open ground', () => {
    const s = flatWorld();
    insertBuilding(s, null, def('well'), 60, 60, 0, 0, { site: false });
    const wellW = def('well').size[0];
    expect(check(s, 'windmill', 60 + wellW + 1, 60).reason).toBe('NEEDS_OPEN_GROUND');
    expect(check(s, 'windmill', 60 + wellW + 2, 60).ok).toBe(true);
  });

  it('does not count roads, trees or decor as buildings', () => {
    const s = flatWorld();
    for (let x = 50; x < 70; x++) s.map.road[58 * S + x] = Road.lane;
    s.map.tree[63 * S + 60] = mature;
    expect(check(s, 'windmill', 60, 60).ok).toBe(true);
  });
});

describe('road', () => {
  it('needs a road in front of the door, of a listed kind', () => {
    const s = flatWorld();
    const [fx, fz] = entranceTiles(def('storehouse'), 60, 60, 0).front;
    expect(check(s, 'storehouse', 60, 60).reason).toBe('NEEDS_ROAD');
    s.map.road[fz * S + fx] = Road.path;
    const ok = check(s, 'storehouse', 60, 60);
    expect(ok.ok).toBe(true);
    expect(ok.warnings).not.toContain('NO_ROAD');
    // A cart shed wants a lane or a street: a path will not do, an avenue will.
    const [cx, cz] = entranceTiles(def('cart-shed'), 70, 60, 0).front;
    s.map.road[cz * S + cx] = Road.path;
    expect(check(s, 'cart-shed', 70, 60).reason).toBe('NEEDS_ROAD');
    s.map.road[cz * S + cx] = Road.lane;
    expect(check(s, 'cart-shed', 70, 60).ok).toBe(true);
    s.map.road[cz * S + cx] = Road.avenue;
    expect(check(s, 'cart-shed', 70, 60).ok).toBe(true);
  });
});

describe('valleyRoad', () => {
  // The flat world's valley gate is (0, 50).
  const paint = (s: WorldState, x0: number, x1: number, z: number) => {
    for (let x = x0; x <= x1; x++) s.map.road[z * S + x] = Road.lane;
    s.networkVersion += 1;
  };

  it('follows road tiles connected to the gate, not a road that is cut off', () => {
    const s = flatWorld();
    paint(s, 0, 40, 50);
    paint(s, 60, 90, 80);
    const tiles = valleyRoadTiles(reader(s));
    expect(tiles[50 * S + 20]).toBe(1);
    expect(tiles[80 * S + 70]).toBe(0);
  });

  it('puts the Trading Post near the valley road only', () => {
    const s = flatWorld();
    paint(s, 0, 40, 50);
    paint(s, 60, 90, 80);
    expect(check(s, 'trading-post', 30, 52).ok).toBe(true);
    expect(check(s, 'trading-post', 70, 76).reason).toBe('NEEDS_VALLEY_ROAD');
    // Joining the two roads makes the second one part of the valley road.
    paint(s, 41, 60, 50);
    for (let z = 51; z < 80; z++) s.map.road[z * S + 60] = Road.lane;
    s.networkVersion += 1;
    expect(check(s, 'trading-post', 70, 76).ok).toBe(true);
  });

  it('refreshes when a road is painted (the road version moves)', () => {
    const s = flatWorld();
    paint(s, 0, 20, 50);
    const r = reader(s);
    const before = valleyRoadTiles(r);
    expect(before[50 * S + 30]).toBe(0);
    expect(valleyRoadTiles(r)).toBe(before);
    paint(s, 21, 30, 50);
    expect(valleyRoadTiles(r)[50 * S + 30]).toBe(1);
  });

  it('is recomputed for a reader without a road version, and fails without a gate', () => {
    const s = flatWorld();
    paint(s, 0, 20, 50);
    const base = reader(s);
    const noVersion: MapReader = {
      size: base.size,
      height: (x, z) => base.height(x, z),
      terrain: (x, z) => base.terrain(x, z),
      water: (x, z) => base.water(x, z),
      road: (x, z) => base.road(x, z),
      tree: (x, z) => base.tree(x, z),
      occupant: (x, z) => base.occupant(x, z),
      deposit: (x, z) => base.deposit(x, z),
      fertility: (x, z) => base.fertility(x, z),
      parcelUnlocked: (x, z) => base.parcelUnlocked(x, z),
      decorNear: (fx, fz, r) => base.decorNear(fx, fz, r),
      valleyGate: [0, 50],
    };
    expect(valleyRoadTiles(noVersion)[50 * S + 10]).toBe(1);
    s.map.road[50 * S + 10] = 0;
    expect(valleyRoadTiles(noVersion)[50 * S + 10]).toBe(0);
    const noGate: MapReader = { ...noVersion, valleyGate: undefined };
    expect(canPlaceBuilding(noGate, def('trading-post'), 10, 52, 0).reason).toBe('NEEDS_VALLEY_ROAD');
  });
});

describe('through the command', () => {
  it('build.place carries the refusal reason for a windmill against a building', () => {
    const s = flatWorld();
    s.economy.treasury = 1_000_000;
    insertBuilding(s, null, def('well'), 60, 60, 0, 0, { site: false });
    expect(rejection(run(s, { t: 'build.place', def: 'windmill', x: 62, z: 60, rot: 0 }))).toBe(
      'NEEDS_OPEN_GROUND',
    );
    expect(rejection(run(s, { t: 'build.place', def: 'windmill', x: 70, z: 60, rot: 0 }))).toBeUndefined();
  });
});
