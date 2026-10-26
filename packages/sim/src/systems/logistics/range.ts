// Storehouse range (docs/spec/13-ledger.md, Logistics): a storehouse serves buildings within 20
// tiles of walking distance. Until walking distances are cached, door-to-door Manhattan distance
// stands in for them; on the hamlet's grid of lanes and paths the two agree closely, and
// Manhattan never underestimates a walk around a block.
import { MAP_SIZE } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { doorTile } from '../movement/api';
import { defOf, isStorehouse } from './stores';

export const LOGISTICS_RANGE = 24;

export interface Reach {
  b: Building;
  door: number;
  radius: number;
  porters: number;
}

/** Built storehouses with their door, range and assigned porters, in id order. */
export function storehouseReach(state: WorldState): Reach[] {
  const out: Reach[] = [];
  for (const b of state.buildings) {
    const def = defOf(b);
    if (b.stage !== 'built' || !b.rt || !isStorehouse(def)) continue;
    const radius = def?.coverage?.find((c) => c.kind === 'logistics')?.radius ?? LOGISTICS_RANGE;
    out.push({ b, door: doorTile(b, def), radius, porters: b.rt.workers.length });
  }
  return out;
}

export function within(reach: Reach, tile: number): boolean {
  const ax = reach.door % MAP_SIZE;
  const bx = tile % MAP_SIZE;
  const d = Math.abs(ax - bx) + Math.abs((reach.door - ax) / MAP_SIZE - (tile - bx) / MAP_SIZE);
  return d <= reach.radius;
}

/** True when some storehouse with porters reaches the tile (the "no porters" marker otherwise). */
export function porterServed(reaches: readonly Reach[], tile: number): boolean {
  for (const r of reaches) if (r.porters > 0 && within(r, tile)) return true;
  return false;
}
