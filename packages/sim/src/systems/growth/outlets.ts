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

/** Home doors no food outlet reaches (outlets going up count already), as [x, z]. */
export function unservedDoors(state: WorldState, services: Services): [number, number][] {
  const out: [number, number][] = [];
  for (const h of state.households) {
    const home = findById(state.buildings, h.homeId);
    if (!home) continue;
    const door = doorTile(home);
    const x = door % S;
    const z = Math.floor(door / S);
    if (!outletCovers(services, x, z)) out.push([x, z]);
  }
  return out;
}

/** Unserved doors a shop on this lot would reach (the stall's food radius). */
export function shopReach(lot: Lot, doors: readonly [number, number][]): number {
  const [x, z] = [lot.x + (lot.w >> 1), lot.z + (lot.d >> 1)];
  let n = 0;
  for (const [dx, dz] of doors) if ((dx - x) * (dx - x) + (dz - z) * (dz - z) <= SHOP_REACH * SHOP_REACH) n++;
  return n;
}

/** Outlets in town, built or going up. */
export function outletCount(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) if (content.buildingById.get(b.def)?.tags?.includes('outlet')) n++;
  return n;
}

/** True when there are more households than the outlets in town can serve. */
export function outletsCrowded(state: WorldState): boolean {
  return Math.floor(state.households.length / HOUSEHOLDS_PER_SHOP) > outletCount(state);
}

/** The shop trade's need in permille: full while households lack an outlet or outlets are crowded. */
export function shopNeed(state: WorldState, services: Services = servicesOf(state)): number {
  return unservedDoors(state, services).length >= SHOP_HOUSEHOLDS || outletsCrowded(state) ? 1000 : 0;
}
