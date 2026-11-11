// R1B: a specialized building's reach is walking distance along roads; the Windmill's raised
// capacity and the frozen Sawmill's one carpenter fewer.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { doorTile } from '../../src/systems/movement/api';
import {
  capacityOf,
  hasRoomFor,
  reachDistances,
  served,
  servedIds,
  withinReach,
} from '../../src/systems/specialized/api';
import { flatWorld, S } from '../helpers';

const def = (id: string) => content.buildingById.get(id)!;

function put(s: WorldState, id: string, x: number, z: number, trade?: string): Building {
  return insertBuilding(s, null, def(id), x, z, 0, 0, {
    site: false,
    ...(trade !== undefined && { trade }),
  });
}

const xz = (tile: number): [number, number] => [tile % S, Math.floor(tile / S)];

/** Paints a lane along the given waypoints (tile coordinates), bumping the network version. */
function road(s: WorldState, ...pts: [number, number][]): void {
  for (let k = 1; k < pts.length; k++) {
    let [x, z] = pts[k - 1]!;
    const [tx, tz] = pts[k]!;
    s.map.road[z * S + x] = Road.lane;
    while (x !== tx || z !== tz) {
      if (x !== tx) x += Math.sign(tx - x);
      else z += Math.sign(tz - z);
      s.map.road[z * S + x] = Road.lane;
    }
  }
  s.networkVersion += 1;
}

/** A workshop business of trade 'baker' whose door front is at (fx, fz). */
function bakerAt(s: WorldState, fx: number, fz: number): Building {
  const probe = put(s, 'workshop', fx, fz - 3, 'baker');
  const [dx, dz] = xz(doorTile(probe));
  s.buildings.splice(s.buildings.indexOf(probe), 1);
  // Shift so the door front lands on (fx, fz).
  return put(s, 'workshop', fx + (fx - dx), fz - 3 + (fz - dz), 'baker');
}

describe('reach along roads', () => {
  it('counts a business 20 road tiles away, not one 20 tiles away as the crow flies but 40 by road', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 30, 50);
    const [wx, wz] = xz(doorTile(mill));
    // Near: 20 road tiles east of the door, straight along the road.
    const near = bakerAt(s, wx + 20, wz);
    road(s, [wx, wz], [wx + 20, wz]);
    // Far: 20 tiles south of the door as the crow flies, reached by a 40-tile road (10 east, 20 south, 10 back).
    const far = bakerAt(s, wx, wz + 20);
    road(s, [wx + 10, wz], [wx + 10, wz + 20], [wx, wz + 20]);
    // Cut the road short of the far business so only the long way round exists: nothing to cut, it is
    // already the long way. Its distance by road is 40.
    expect(withinReach(s, mill, doorTile(near))).toBe(true);
    expect(reachDistances(s, mill).get(doorTile(near))).toBe(20);
    expect(withinReach(s, mill, doorTile(far))).toBe(false);
    expect(servedIds(s, mill)).toEqual([near.id]);
    expect(served(s, mill)).toBe(1);
  });

  it('refreshes its distances when a road is painted', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 30, 50);
    const [wx, wz] = xz(doorTile(mill));
    const biz = bakerAt(s, wx + 40, wz);
    road(s, [wx, wz], [wx + 40, wz]);
    expect(withinReach(s, mill, doorTile(biz))).toBe(false);
    // A second road from the door's far end: nothing new in reach until a shorter way is painted.
    road(s, [wx, wz], [wx, wz + 10]);
    expect(withinReach(s, mill, doorTile(biz))).toBe(false);
    // Remove the middle of the road: the near half is still in reach.
    s.map.road[wz * S + wx + 20] = 0;
    s.networkVersion += 1;
    expect(withinReach(s, mill, wx + 10 + wz * S)).toBe(true);
    expect(withinReach(s, mill, wx + 30 + wz * S)).toBe(false);
  });

  it('has room for the first businesses by id, up to its capacity', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 30, 50);
    const [wx, wz] = xz(doorTile(mill));
    road(s, [wx, wz], [wx + 20, wz]);
    const a = bakerAt(s, wx + 6, wz);
    const b = bakerAt(s, wx + 12, wz);
    const c = bakerAt(s, wx + 18, wz);
    expect(capacityOf(s, mill)).toBe(2);
    expect(servedIds(s, mill)).toEqual([a.id, b.id, c.id]);
    expect(hasRoomFor(s, mill, a.id)).toBe(true);
    expect(hasRoomFor(s, mill, b.id)).toBe(true);
    expect(hasRoomFor(s, mill, c.id)).toBe(false);
    // A business that is not there yet: no room while the mill is full.
    expect(hasRoomFor(s, mill, 999_999)).toBe(false);
  });
});

describe('capacity', () => {
  it('raises the Windmill when it stands four levels above the ground around it', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 60, 60);
    expect(capacityOf(s, mill)).toBe(2);
    const [w, d] = def('windmill').size;
    const setFootprint = (h: number) => {
      for (let z = 60; z < 60 + d; z++) for (let x = 60; x < 60 + w; x++) s.map.height[z * S + x] = h;
    };
    setFootprint(5);
    expect(capacityOf(s, mill)).toBe(2);
    setFootprint(6);
    expect(capacityOf(s, mill)).toBe(4);
  });

  it('takes one carpenter from the Sawmill while the river is frozen, never below zero', () => {
    const s = flatWorld();
    const saw = put(s, 'sawmill', 60, 60);
    expect(capacityOf(s, saw)).toBe(3);
    s.weather.river.frozen = true;
    expect(capacityOf(s, saw)).toBe(2);
    s.weather.river.frozen = false;
    expect(capacityOf(s, saw)).toBe(3);
  });
});
