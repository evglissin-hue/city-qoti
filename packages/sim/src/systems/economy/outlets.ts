// Outlet API (C3.0 contract; C3C owns it). Residents (C3A) shop through it: market stalls first,
// storehouses when no stall is within reach. Porters keep stalls stocked to STALL_RESTOCK_TARGET
// food (logistics); goods a porter has been promised (reservedOut) are never handed out.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';

/** Takes up to qty units of a good from an outlet's store; returns the units taken. */
export function takeFromOutlet(
  state: WorldState,
  buildingId: EntityId,
  goodIndex: number,
  qty: number,
): number {
  const b = findById(state.buildings, buildingId);
  const rt = b?.rt;
  if (!rt || b.stage !== 'built') return 0;
  const free = (rt.store[goodIndex] ?? 0) - (rt.reservedOut[goodIndex] ?? 0);
  const n = Math.max(0, Math.min(qty, free));
  if (n > 0) {
    rt.store[goodIndex]! -= n;
  }
  return n;
}

/** Food units an outlet can hand out now. */
export function outletFood(state: WorldState, buildingId: EntityId): number {
  const rt = findById(state.buildings, buildingId)?.rt;
  if (!rt) return 0;
  let n = 0;
  for (let i = 0; i < content.goods.length; i++) {
    if (content.goods[i]!.food) n += Math.max(0, (rt.store[i] ?? 0) - (rt.reservedOut[i] ?? 0));
  }
  return n;
}

/**
 * The nearest built outlet with food for a tile: a market stall within its coverage radius, else
 * the nearest storehouse. Straight-line distance to the outlet's door, ties by id. 0 when none.
 */
export function nearestOutletWithFood(state: WorldState, tile: number): EntityId {
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  let bestStall = 0;
  let bestStallD = Infinity;
  let bestStore = 0;
  let bestStoreD = Infinity;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    const def = content.buildingById.get(b.def);
    if (!def?.tags?.includes('outlet') || outletFood(state, b.id) <= 0) continue;
    const door = doorTile(b, def);
    const dx = (door % MAP_SIZE) - x;
    const dz = Math.floor(door / MAP_SIZE) - z;
    const d = dx * dx + dz * dz;
    if (def.tags.includes('market')) {
      const r = def.coverage?.find((c) => c.kind === 'food')?.radius ?? 14;
      if (d <= r * r && d < bestStallD) {
        bestStallD = d;
        bestStall = b.id;
      }
    } else if (d < bestStoreD) {
      bestStoreD = d;
      bestStore = b.id;
    }
  }
  return bestStall || bestStore;
}
