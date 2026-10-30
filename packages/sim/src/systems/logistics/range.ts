// Storehouse range (docs/spec/13-ledger.md, Logistics): a storehouse serves buildings within 24
// tiles of walking distance; a building no storehouse with porters reaches is adopted by the
// nearest one with porters (playtest round five), whose porters make the long walk. Until walking distances are cached, door-to-door Manhattan distance
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
  /** Doors beyond every staffed storehouse's range that this one serves anyway (see adoptStrays). */
  adopted?: Set<number>;
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
  if (reach.adopted?.has(tile)) return true;
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

/** The storehouse with porters nearest the tile (door to door), first in id order on ties. */
export function nearestStaffed(reaches: readonly Reach[], tile: number): Reach | null {
  let best: Reach | null = null;
  let bestD = Infinity;
  const tx = tile % MAP_SIZE;
  const tz = (tile - tx) / MAP_SIZE;
  for (const r of reaches) {
    if (r.porters === 0) continue;
    const x = r.door % MAP_SIZE;
    const d = Math.abs(x - tx) + Math.abs((r.door - x) / MAP_SIZE - tz);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * Playtest round five: each door no storehouse with porters reaches is adopted by the nearest one
 * that has porters, so a clay pit out by its deposit gets its planks and its clay collected (with
 * a long walk) instead of waiting forever. A storehouse nearby still makes the trips short.
 */
export function adoptStrays(reaches: readonly Reach[], doors: readonly number[]): void {
  for (const door of doors) {
    if (porterServed(reaches, door)) continue;
    const r = nearestStaffed(reaches, door);
    if (r) (r.adopted ??= new Set()).add(door);
  }
}

/**
 * True when some storehouse with porters serves the tile: in range, or by adopting it. Only a town
 * with no porters at all leaves a building unserved.
 */
export function porterReachable(reaches: readonly Reach[], _tile: number): boolean {
  for (const r of reaches) if (r.porters > 0) return true;
  return false;
}
