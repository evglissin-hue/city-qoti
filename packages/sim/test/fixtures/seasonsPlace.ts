// Shared by the I3 fixtures (C5.0): place a building only where its footprint is free, set the clock
// to a given season day, and add decor through the index.
import { content } from '@qoti/content';
import { MAP_SIZE, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { Building, Decor, EntityId, Rot4, WorldState } from '../../src/contracts';
import { footprintSize } from '../../src/rules/footprint';
import { insertBuilding } from '../../src/state/place';
import { worldIndex } from '../../src/state/worldIndex';

/** Inserts a built building, after checking its footprint is free land (throws otherwise). */
export function placeFree(state: WorldState, def: string, x: number, z: number, rot: Rot4 = 0): Building {
  const d = content.buildingById.get(def);
  if (!d) throw new Error(`No building ${def}`);
  const [w, dd] = footprintSize(d, rot);
  for (let tz = z; tz < z + dd; tz++) {
    for (let tx = x; tx < x + w; tx++) {
      const i = tz * MAP_SIZE + tx;
      if (state.map.occupant[i] || state.map.road[i] || state.map.water[i]) {
        throw new Error(`${def} at ${x},${z}: tile ${tx},${tz} is taken`);
      }
    }
  }
  return insertBuilding(state, null, d, x, z, rot, 0, { site: false });
}

/** The tick of `hour` on day `day` (1 to 6) of `season` (0 to 3) in year index `year` (0 = year 1). */
export function tickAt(year: number, season: number, day: number, hour: number): number {
  const dayIndex = year * 24 + season * 6 + (day - 1);
  return dayIndex * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
}

export function addDecorAt(state: WorldState, def: string, fx: number, fz: number): EntityId {
  const d: Decor = {
    id: state.nextId++,
    def,
    fx: Math.round(fx * TILE_FP),
    fz: Math.round(fz * TILE_FP),
    rot: 0,
    builtBy: 0,
  };
  const grid = worldIndex(state).decorGrid;
  state.decor.push(d);
  grid.add(d);
  return d.id;
}
