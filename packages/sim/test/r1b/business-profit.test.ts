// R1X E10: a business's profit line in the Businesses view, and the ghost's reach helper agrees with
// the sim's own walk.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { doorTile } from '../../src/systems/movement/api';
import { reachDistances, reachRoadTiles } from '../../src/systems/specialized/api';
import { businessView } from '../../src/view/businesses';
import { flatWorld, S } from '../helpers';
import { standardValley } from './valley';

const def = (id: string) => content.buildingById.get(id)!;
function put(s: WorldState, id: string, x: number, z: number, trade?: string): Building {
  return insertBuilding(s, null, def(id), x, z, 0, 0, { site: false, ...(trade !== undefined && { trade }) });
}

describe('BusinessView.profit', () => {
  it('carries takings and outgoings for a built business, and none for a specialized building', () => {
    const s = standardValley('profit');
    const baker = put(s, 'workshop', 36, 50, 'baker');
    const mill = put(s, 'windmill', 30, 50);
    const v = businessView(s, baker);
    expect(v.profit).toBeDefined();
    expect(v.profit!.takes).toBeGreaterThanOrEqual(0);
    expect(v.profit!.pays).toBeGreaterThan(0);
    expect(businessView(s, mill).profit).toBeUndefined();
  });
});

describe('reachRoadTiles', () => {
  it('lists the same road tiles, with the same steps, as the sim walks for a built building', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 30, 50);
    const z = Math.floor(doorTile(mill) / S);
    for (let x = 20; x < 60; x++) s.map.road[z * S + x] = Road.lane;
    s.networkVersion += 1;
    const road = (x: number, zz: number) => s.map.road[zz * S + x]! > 0;
    const tiles = reachRoadTiles(road, mill);
    const walked = reachDistances(s, mill);
    expect(tiles.size).toBeGreaterThan(10);
    expect([...tiles].sort()).toEqual([...walked].sort());
  });

  it('is empty with no road in range and for a building with no reach', () => {
    expect(reachRoadTiles(() => false, { def: 'windmill', x: 30, z: 50, rot: 0 }).size).toBe(0);
    expect(reachRoadTiles(() => true, { def: 'cottage', x: 30, z: 50, rot: 0 }).size).toBe(0);
  });
});
