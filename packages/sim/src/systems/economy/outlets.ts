// Outlet API (C3.0 contract; C3C owns it). Residents (C3A) shop through it: market stalls first,
// storehouses when no stall is within reach. Porters keep stalls stocked to STALL_RESTOCK_TARGET
// food (logistics); goods a porter has been promised (reservedOut) are never handed out.
import { isFood } from '../../state/zones';
import { content, type BuildingDef } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { BuildingRuntime, EntityId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { countCustomer, countSold } from '../levels/counters';
import { shelfOf } from '../market/round';
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
  // R3A: a tavern sells what it pours (its input); everyone else sells from the store.
  const shelf = shelfOf(b)!;
  const free = (shelf.stock[goodIndex] ?? 0) - (shelf.reserved?.[goodIndex] ?? 0);
  const n = Math.max(0, Math.min(qty, free));
  if (n > 0) {
    shelf.stock[goodIndex]! -= n;
    // R1B: a shop counts what it sold and who came (levels).
    countSold(b, n);
    countCustomer(b);
  }
  return n;
}

/** Food good indexes, found once (content does not change while the sim runs). */
let foodGoods: number[] | null = null;

function foodIndexes(): readonly number[] {
  if (!foodGoods) {
    foodGoods = [];
    for (let i = 0; i < content.goods.length; i++) if (isFood(i)) foodGoods.push(i);
  }
  return foodGoods;
}

/** Food units a store can hand out now (none promised to porters). */
function storeFood(rt: BuildingRuntime): number {
  let n = 0;
  for (const i of foodIndexes()) n += Math.max(0, (rt.store[i] ?? 0) - (rt.reservedOut[i] ?? 0));
  return n;
}

/** Food units an outlet can hand out now. */
export function outletFood(state: WorldState, buildingId: EntityId): number {
  const rt = findById(state.buildings, buildingId)?.rt;
  return rt ? storeFood(rt) : 0;
}

/**
 * R2X: the outlet defs, and for a market its food coverage radius squared, found once (evening
 * shopping asks for the nearest outlet for every shopper; the scan read each building's tags).
 */
let outletDefs: Map<string, { def: BuildingDef; market: boolean; r2: number }> | null = null;

function outletDef(id: string) {
  if (!outletDefs) {
    outletDefs = new Map();
    for (const def of content.buildings) {
      if (!def.tags?.includes('outlet')) continue;
      const market = def.tags.includes('market');
      const r = market ? (def.coverage?.find((c) => c.kind === 'food')?.radius ?? 14) : 0;
      outletDefs.set(def.id, { def, market, r2: r * r });
    }
  }
  return outletDefs.get(id);
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
    const o = outletDef(b.def);
    if (!o || storeFood(b.rt) <= 0) continue;
    const door = doorTile(b, o.def);
    const dx = (door % MAP_SIZE) - x;
    const dz = Math.floor(door / MAP_SIZE) - z;
    const d = dx * dx + dz * dz;
    if (o.market) {
      if (d <= o.r2 && d < bestStallD) {
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
