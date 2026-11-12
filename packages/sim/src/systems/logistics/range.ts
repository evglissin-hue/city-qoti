// Storehouse range (docs/spec/13-ledger.md, Logistics): a storehouse serves buildings within 24
// tiles of walking distance; a building no storehouse with porters reaches is adopted by the
// nearest one with porters (playtest round five), whose porters make the long walk. Until walking distances are cached, door-to-door Manhattan distance
// stands in for them; on the hamlet's grid of lanes and paths the two agree closely, and
// Manhattan never underestimates a walk around a block.
import { MAP_SIZE } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { doorTile } from '../movement/api';
import { type Defs, usable } from '../growth/defs';
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
export function storehouseReach(state: WorldState, known?: Defs): Reach[] {
  const out: Reach[] = [];
  const bs = state.buildings;
  const defs = usable(state, known);
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!;
    // The cheap tests first: a def is only looked up for a built building with a runtime.
    if (b.stage !== 'built' || !b.rt) continue;
    const def = defs ? defs[i] : defOf(b);
    if (!isStorehouse(def)) continue;
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

/**
 * True when the storehouse has porters out working: some assigned, and not paused. A paused
 * storehouse keeps its porters indoors, so it never adopts strays or takes relays; the doors in its
 * own range wait for it (porterServed still counts it), as pausing it means.
 */
export function staffed(r: Reach): boolean {
  return r.porters > 0 && !r.b.rt?.paused;
}

/**
 * True when some storehouse with porters reaches the tile, paused or not: a door in a paused
 * storehouse's range waits for it rather than being adopted by another.
 */
export function porterServed(reaches: readonly Reach[], tile: number): boolean {
  for (const r of reaches) if (r.porters > 0 && within(r, tile)) return true;
  return false;
}

/**
 * The working storehouse nearest the tile (door to door), first in id order on ties. A paused one
 * nearer still would adopt the door and never send anyone.
 */
export function nearestStaffed(reaches: readonly Reach[], tile: number): Reach | null {
  let best: Reach | null = null;
  let bestD = Infinity;
  const tx = tile % MAP_SIZE;
  const tz = (tile - tx) / MAP_SIZE;
  for (const r of reaches) {
    if (!staffed(r)) continue;
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
  for (const r of reaches) if (staffed(r)) return true;
  return false;
}

/** Map tiles a side of the buckets a reach index sorts storehouses into. */
const BUCKET = 16;

/**
 * porterServed (and, with `slack`, the growth pass's looser "about in reach") for many tiles at once:
 * the storehouses with porters are sorted into buckets of the map by the box their range covers,
 * so each tile asks only the few whose range could hold it. Build one a pass.
 */
export function porterIndex(reaches: readonly Reach[], slack = 0): (tile: number) => boolean {
  const n = Math.ceil(MAP_SIZE / BUCKET);
  const buckets: Reach[][] = Array.from({ length: n * n }, () => []);
  const adopted = new Set<number>();
  for (const r of reaches) {
    if (r.porters <= 0) continue;
    for (const t of r.adopted ?? []) adopted.add(t);
    const x = r.door % MAP_SIZE;
    const z = (r.door - x) / MAP_SIZE;
    const span = r.radius + slack;
    const bx0 = Math.max(0, Math.floor((x - span) / BUCKET));
    const bx1 = Math.min(n - 1, Math.floor((x + span) / BUCKET));
    const bz0 = Math.max(0, Math.floor((z - span) / BUCKET));
    const bz1 = Math.min(n - 1, Math.floor((z + span) / BUCKET));
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) buckets[bz * n + bx]!.push(r);
  }
  return (tile) => {
    if (adopted.has(tile)) return true;
    const x = tile % MAP_SIZE;
    const z = (tile - x) / MAP_SIZE;
    for (const r of buckets[Math.floor(z / BUCKET) * n + Math.floor(x / BUCKET)]!) {
      const rx = r.door % MAP_SIZE;
      if (Math.abs(rx - x) + Math.abs((r.door - rx) / MAP_SIZE - z) <= r.radius + slack) return true;
    }
    return false;
  };
}
