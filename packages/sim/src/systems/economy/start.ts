// The standard valley's starting town (docs/spec/02-game-overview.md, New valley). C3.0 baseline;
// C3C owns and tunes it. Runs once inside createWorld, before any seat joins, so it writes state
// directly instead of through commands.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE, START_TREASURY } from '../../constants';
import type { Rot4, WorldState } from '../../contracts';
import { inBounds, Road } from '../../map/layers';
import { canPlaceBuilding } from '../../rules/building';
import { canPaintRoad } from '../../rules/road';
import { entranceTiles, footprintSize } from '../../rules/footprint';
import { insertBuilding } from '../../state/place';
import { worldIndex } from '../../state/worldIndex';

/** Storehouse stock at founding: [good id, units]. */
export const START_GOODS: readonly [string, number][] = [
  ['logs', 40],
  ['planks', 50],
  ['stone', 30],
  ['bread', 16],
  ['vegetables', 16],
  ['fish', 8],
];

/** Starting buildings in placement order; homes and the well cluster around the town hall. */
const START_BUILDINGS: readonly string[] = ['town-hall', 'storehouse', 'cottage', 'cottage', 'well'];

export function setupStandardStart(state: WorldState): void {
  const S = MAP_SIZE;
  state.economy.treasury = START_TREASURY;
  const [ax0, az0, ax1, az1] = state.meta.startArea;
  const cx = (ax0 + ax1 + 1) >> 1;
  const cz = (az0 + az1 + 1) >> 1;

  // A path across the end of the valley lane gives the first buildings their frontage.
  const reader = worldIndex(state).reader;
  const along: [number, number] = state.meta.flow === 'ns' ? [0, 1] : [1, 0];
  for (const sign of [1, -1]) {
    for (let k = 1; k <= 9; k++) {
      const x = cx + along[0] * k * sign;
      const z = cz + along[1] * k * sign;
      if (!inBounds(x, z, S) || state.map.road[z * S + x]) continue;
      if (!canPaintRoad(reader, 'path', [[x, z]]).ok) break;
      state.map.road[z * S + x] = Road.path;
      state.map.tree[z * S + x] = 0;
    }
  }

  for (const id of START_BUILDINGS) {
    const def = content.buildingById.get(id);
    if (!def) continue;
    const spot = findSpot(state, id, cx, cz, id !== 'well');
    if (!spot) continue;
    const placement = canPlaceBuilding(reader, def, spot[0], spot[1], spot[2]);
    const b = insertBuilding(state, null, def, spot[0], spot[1], spot[2], 0, {
      site: false,
      foundation: placement.foundation,
    });
    if (id === 'storehouse' && b.rt) {
      for (const [good, qty] of START_GOODS) {
        const i = content.goodIndex.get(good);
        if (i !== undefined) b.rt.store[i] = qty;
      }
    }
  }
  state.networkVersion += 1;
}

/** The nearest valid spot to (cx, cz) whose entrance faces a road (when `needRoad`). */
function findSpot(
  state: WorldState,
  id: string,
  cx: number,
  cz: number,
  needRoad: boolean,
): [number, number, Rot4] | null {
  const def = content.buildingById.get(id)!;
  const reader = worldIndex(state).reader;
  let best: [number, number, Rot4] | null = null;
  let bestD = Infinity;
  for (let r = 0; r <= 14; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let rot = 0 as Rot4; rot < 4; rot = (rot + 1) as Rot4) {
          const x = cx + dx;
          const z = cz + dz;
          const p = canPlaceBuilding(reader, def, x, z, rot);
          if (!p.ok || crowded(state, def, x, z, rot)) continue;
          const { front } = entranceTiles(def, x, z, rot);
          if (needRoad && !reader.road(front[0], front[1])) continue;
          const d = Math.abs(front[0] - cx) + Math.abs(front[1] - cz) + (p.foundation ? 2 : 0);
          if (d < bestD) {
            bestD = d;
            best = [x, z, rot];
          }
        }
      }
    }
    if (best && r >= 4) break;
  }
  return best;
}

/** True when another building stands on the ring of tiles around the footprint. */
function crowded(state: WorldState, def: BuildingDef, x: number, z: number, rot: Rot4): boolean {
  const [w, d] = footprintSize(def, rot);
  for (let tz = z - 1; tz <= z + d; tz++) {
    for (let tx = x - 1; tx <= x + w; tx++) {
      if (!inBounds(tx, tz, MAP_SIZE)) continue;
      if (state.map.occupant[tz * MAP_SIZE + tx]) return true;
    }
  }
  return false;
}
