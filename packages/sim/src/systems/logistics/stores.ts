// Buffers and storage shared by construction, production, logistics and the books. A building
// keeps goods in one of three places: `store` (storehouses and market stalls, all goods sharing
// `def.storage`), `output` (what a producer made, `def.outputBuffer` per good) or `input` (what a
// producer is waiting to use). Construction sites keep theirs in `construction`.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, BuildingRuntime, EntityId, WorldState } from '../../contracts';
import { doorTile } from '../movement/api';

/** Output buffer capacity per good (default 10; farms 30). */
export const DEFAULT_OUTPUT_BUFFER = 10;

export function defOf(b: Building): BuildingDef | undefined {
  return content.buildingById.get(b.def);
}

/** Storehouses and market stalls: buildings that keep goods in `store`. */
export function isStorage(def: BuildingDef | undefined): boolean {
  return (def?.storage ?? 0) > 0;
}

export function isStorehouse(def: BuildingDef | undefined): boolean {
  return !!def?.tags?.includes('storehouse');
}

export function isMarket(def: BuildingDef | undefined): boolean {
  return !!def?.tags?.includes('market');
}

export function outputCap(def: BuildingDef | undefined): number {
  return def?.outputBuffer ?? DEFAULT_OUTPUT_BUFFER;
}

export function sum(values: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < values.length; i++) n += values[i]!;
  return n;
}

/** Free units in a storage building, counting goods already on their way in. */
export function storageSpace(def: BuildingDef | undefined, rt: BuildingRuntime): number {
  return Math.max(0, (def?.storage ?? 0) - sum(rt.store) - sum(rt.reservedIn));
}

/** Food units in a building's store plus those on their way in. */
export function foodIncoming(rt: BuildingRuntime): number {
  let n = 0;
  for (let i = 0; i < content.goods.length; i++) {
    if (content.goods[i]!.food) n += (rt.store[i] ?? 0) + (rt.reservedIn[i] ?? 0);
  }
  return n;
}

/** Manhattan distance between two tile indexes: the walking estimate until paths are cached. */
export function tileDistance(a: number, b: number): number {
  const ax = a % MAP_SIZE;
  const bx = b % MAP_SIZE;
  return Math.abs(ax - bx) + Math.abs((a - ax) / MAP_SIZE - (b - bx) / MAP_SIZE);
}

/**
 * Puts goods into the nearest built storehouses with room (nearest to `tile`, ties by id),
 * skipping `exclude`. Returns the units that found a home; the rest are lost.
 */
export function stowNearest(
  state: WorldState,
  tile: number,
  good: number,
  qty: number,
  exclude: EntityId,
): number {
  let left = qty;
  while (left > 0) {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of state.buildings) {
      if (b.id === exclude || b.stage !== 'built' || !b.rt) continue;
      const def = defOf(b);
      if (!isStorehouse(def) || storageSpace(def, b.rt) <= 0) continue;
      const d = tileDistance(tile, doorTile(b, def));
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) break;
    const n = Math.min(left, storageSpace(defOf(best), best.rt!));
    best.rt!.store[good]! += n;
    left -= n;
  }
  return qty - left;
}
