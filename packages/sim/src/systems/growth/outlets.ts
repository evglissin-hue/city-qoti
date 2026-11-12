// Outlets and the households they reach (docs/spec/13-ledger.md, Demand: Shops): households no
// outlet reaches, or more than eight households an outlet. Read by the growth pass, the Shops bar and
// the shop trade's need.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Lot, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';
import { outletCovers, servicesOf } from './desirability';
import { SHOP_REACH } from './site';

const S = MAP_SIZE;

/** Households one outlet serves before the town wants another shop. */
export const HOUSEHOLDS_PER_SHOP = 8;
/** Households without an outlet in reach that make a shop worth growing. */
export const SHOP_HOUSEHOLDS = 2;

export type Services = ReturnType<typeof servicesOf>;

/** Map tiles a side of the buckets outlets are sorted into. */
const BUCKET = 16;

/** outletCovers for many tiles at once: outlets sorted into buckets of the map by their reach. */
function outletIndex(services: Services): (x: number, z: number) => boolean {
  const n = Math.ceil(S / BUCKET);
  const buckets: [number, number, number][][] = Array.from({ length: n * n }, () => []);
  for (const o of services.outlets) {
    const [x, z, r] = o;
    const bx0 = Math.max(0, Math.floor((x - r) / BUCKET));
    const bx1 = Math.min(n - 1, Math.floor((x + r) / BUCKET));
    const bz0 = Math.max(0, Math.floor((z - r) / BUCKET));
    const bz1 = Math.min(n - 1, Math.floor((z + r) / BUCKET));
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) buckets[bz * n + bx]!.push(o);
  }
  return (x, z) => {
    for (const [cx, cz, r] of buckets[Math.floor(z / BUCKET) * n + Math.floor(x / BUCKET)]!) {
      if ((cx - x) * (cx - x) + (cz - z) * (cz - z) <= r * r) return true;
    }
    return false;
  };
}

/** Each household's home door (tile index), in household order. */
export function homeDoorTiles(state: WorldState): number[] {
  const out: number[] = [];
  for (const h of state.households) {
    const home = findById(state.buildings, h.homeId);
    if (home) out.push(doorTile(home));
  }
  return out;
}

/** Home doors no food outlet reaches (outlets going up count already), as [x, z]. */
export function unservedDoors(
  state: WorldState,
  services: Services,
  doors: readonly number[] = homeDoorTiles(state),
): [number, number][] {
  const out: [number, number][] = [];
  const covers =
    services.outlets.length > 8
      ? outletIndex(services)
      : (x: number, z: number) => outletCovers(services, x, z);
  for (const door of doors) {
    const x = door % S;
    const z = Math.floor(door / S);
    if (!covers(x, z)) out.push([x, z]);
  }
  return out;
}

/** Unserved doors a shop on this lot would reach (the stall's food radius), stopping at `atMost`. */
export function shopReach(lot: Lot, doors: readonly [number, number][], atMost = Infinity): number {
  const [x, z] = [lot.x + (lot.w >> 1), lot.z + (lot.d >> 1)];
  let n = 0;
  for (const [dx, dz] of doors) {
    if ((dx - x) * (dx - x) + (dz - z) * (dz - z) <= SHOP_REACH * SHOP_REACH && ++n >= atMost) return n;
  }
  return n;
}

/** Outlets in town, built or going up. */
export function outletCount(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) if (content.buildingById.get(b.def)?.tags?.includes('outlet')) n++;
  return n;
}

/** True when there are more households than the outlets in town can serve. */
export function outletsCrowded(state: WorldState, outlets: number = outletCount(state)): boolean {
  return Math.floor(state.households.length / HOUSEHOLDS_PER_SHOP) > outlets;
}

/** The shop trade's need in permille: full while households lack an outlet or outlets are crowded. */
export function shopNeed(state: WorldState, services: Services = servicesOf(state)): number {
  return unservedDoors(state, services).length >= SHOP_HOUSEHOLDS || outletsCrowded(state) ? 1000 : 0;
}
