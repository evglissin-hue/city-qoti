// Shared bits for the R3H tests: a specialized building placed in the hamlet fixture's open ground,
// its day's counters set by hand, and woods planted for a Lodge.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../src/constants';
import type { Building, BusinessCounters, WorldState } from '../../src/contracts';
import { TREE_SPECIES, treeValue } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { emptyCounters } from '../../src/state/zones';
import { good } from '../ledger/helpers';

export { good };

/** A built specialized building at a tile (rot 0), at a level, with fresh counters. */
export function spot(state: WorldState, def: string, x: number, z: number, level = 1): Building {
  const d = content.buildingById.get(def)!;
  const b = insertBuilding(state, null, d, x, z, 0, 0, { site: false });
  if (level > 1) b.level = level;
  b.counters = emptyCounters();
  return b;
}

/** Sets the day's counters (the rest zero). */
export function today(b: Building, patch: Partial<BusinessCounters>): void {
  b.counters = { ...emptyCounters(), ...patch };
}

/** Mature oaks on `n` free tiles around the point (a Lodge's woods rule: 12 within 8). */
export function plantWoods(state: WorldState, cx: number, cz: number, n = 14): void {
  let left = n;
  for (let z = cz - 7; z <= cz + 7 && left > 0; z++)
    for (let x = cx - 7; x <= cx + 7 && left > 0; x++) {
      const i = z * MAP_SIZE + x;
      if (state.map.occupant[i] || state.map.road[i] || state.map.tree[i]) continue;
      state.map.tree[i] = treeValue(TREE_SPECIES.oak, 3);
      left--;
    }
}
