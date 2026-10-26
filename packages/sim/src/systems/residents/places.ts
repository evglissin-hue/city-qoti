// Where things are: door tiles (cached per network epoch), homes and vacancies.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, EntityId, Household, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';
import { walkGrid } from '../movement/grid';

interface DoorCache {
  epoch: number;
  doors: Map<EntityId, number>;
}
const doorCaches = new WeakMap<WorldState, DoorCache>();

/** The door tile of a building, or -1 when it is gone. Buildings never move, so this caches well. */
export function doorOf(state: WorldState, buildingId: EntityId): number {
  if (!buildingId) return -1;
  const epoch = walkGrid(state).epoch;
  let c = doorCaches.get(state);
  if (!c || c.epoch !== epoch) {
    c = { epoch, doors: new Map() };
    doorCaches.set(state, c);
  }
  let door = c.doors.get(buildingId);
  if (door === undefined) {
    const b = findById(state.buildings, buildingId);
    door = b ? doorTile(b) : -1;
    c.doors.set(buildingId, door);
  }
  return door;
}

export function householdOf(state: WorldState, r: Resident): Household | undefined {
  return findById(state.households, r.householdId);
}

/** The resident's home building id, or 0. */
export function homeIdOf(state: WorldState, r: Resident): EntityId {
  return householdOf(state, r)?.homeId ?? 0;
}

export function tileX(tile: number): number {
  return tile % MAP_SIZE;
}

export function tileZ(tile: number): number {
  return (tile - (tile % MAP_SIZE)) / MAP_SIZE;
}

export function manhattan(a: number, b: number): number {
  return Math.abs(tileX(a) - tileX(b)) + Math.abs(tileZ(a) - tileZ(b));
}

export function chebyshev(a: number, b: number): number {
  return Math.max(Math.abs(tileX(a) - tileX(b)), Math.abs(tileZ(a) - tileZ(b)));
}

/** A home with room for another household. */
export interface Vacancy {
  building: Building;
  /** Residents the home holds. */
  residents: number;
}

/** Built homes with room for another household, by building id. */
export function vacantHomes(state: WorldState): Vacancy[] {
  const out: Vacancy[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const housing = content.buildingById.get(b.def)?.housing;
    if (!housing) continue;
    let living = 0;
    for (const h of state.households) if (h.homeId === b.id) living++;
    if (living < housing.households) out.push({ building: b, residents: housing.residents });
  }
  return out;
}

/** Number of residents of all stages that count as working age (adult and young). */
export function isWorkingAge(r: Resident): boolean {
  return r.stage === 'adult' || r.stage === 'young';
}
