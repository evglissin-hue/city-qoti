// Outlets and the households they reach (docs/spec/13-ledger.md, Demand: Shops): households no
// outlet reaches, or more than eight households an outlet. Read by the growth pass, the Shops bar and
// the shop trade's need.
//
// R2B (docs/spec/19-evenings.md, Shops follow the walkers): a place that drew a crowd with nothing to
// sell (`unservedPlaces`) counts as SHOP_HOUSEHOLDS homes with no outlet: `unservedDoors` appends that
// many copies of the place's anchor, after the real home doors, so growth's shop demand, its lot
// choice (shopReach) and the shop trade's need all want a shop by the walkers. The Shops bar subtracts
// them again to count households only.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, Lot, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { rankAtLeast } from '../../state/village';
import { dayIndex, hourOf } from '../economy/time';
import { doorTile } from '../movement/api';
import { treatsOnShelf } from '../market/round';
import { placeById } from '../places/api';
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

/** Evening steps past a tile in an evening's worth: the layer halves at 04:00, so it reads as two days. */
export function eveningPassers(state: WorldState, tile: number): number {
  return Math.floor((state.map.footfallEve[tile] ?? 0) / 2);
}

/** Tags of a building (built or going up) whose door within reach means a place is served. */
function sellsAtPlaces(state: WorldState, b: Building): boolean {
  const tags = content.buildingById.get(b.def)?.tags;
  if (!tags) return false;
  if (tags.includes('market')) return true;
  // R2X: a tavern counts once it has Treats to sell. Porters stock only market shelves, so a
  // tavern's stays empty until R3's supplies stock it, and a crowd by an empty tavern never asked
  // for a shop (willow's nothing-to-sell gaps by the tavern could not close from the Ledger).
  return tags.includes('tavern') && treatsOnShelf(state, b);
}

/**
 * Places that drew a crowd with nothing to sell: the last closed evening had `unservedVisitors` or
 * more and no outlet served, the place still stands, and no market (built or going up) or tavern with
 * Treats on its shelf has its door within `serveRadius` of it. Anchor tiles, in place id order. Only
 * from Village rank.
 */
export function unservedPlaces(state: WorldState): number[] {
  if (state.places.length === 0 || !rankAtLeast(state, 'village')) return [];
  const P = content.places;
  const hour = hourOf(state.tick);
  const underway =
    hour >= P.eveningHour && hour < P.homeHour && state.evenings.tonight.day === dayIndex(state.tick);
  const doors: number[] = [];
  for (const b of state.buildings) if (sellsAtPlaces(state, b)) doors.push(doorTile(b));
  const out: number[] = [];
  for (const row of state.places) {
    const k = row.visitors.length - (underway ? 2 : 1);
    if (k < 0 || (row.visitors[k] ?? 0) < P.unservedVisitors || (row.served[k] ?? 0) !== 0) continue;
    const place = placeById(state, row.id);
    if (!place) continue;
    const px = place.tile % S;
    const pz = Math.floor(place.tile / S);
    if (doors.some((d) => Math.abs((d % S) - px) + Math.abs(Math.floor(d / S) - pz) <= P.serveRadius))
      continue;
    out.push(place.tile);
  }
  return out;
}

/** Home doors no food outlet reaches (outlets going up count already), as [x, z]; then the unserved places'. */
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
  for (const tile of unservedPlaces(state)) {
    for (let i = 0; i < SHOP_HOUSEHOLDS; i++) out.push([tile % S, Math.floor(tile / S)]);
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
