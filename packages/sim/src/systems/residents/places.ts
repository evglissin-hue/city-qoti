// Where things are: door tiles and a coarse grid of buildings by door (both derived indexes,
// rebuilt per network epoch, never saved), homes and vacancies.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, EntityId, Household, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { doorTile } from '../movement/api';
import { walkGrid } from '../movement/grid';

/** Side of a building grid cell in tiles. */
const CELL = 8;
const CELLS = Math.ceil(MAP_SIZE / CELL);

interface DoorCache {
  epoch: number;
  doors: Map<EntityId, number>;
  /** Buildings by the grid cell of their door, in id order; built on first use. */
  cells: Building[][] | null;
  /** Buildings with water coverage (any stage), in id order; built on first use. */
  wells: Building[] | null;
}
const doorCaches = new WeakMap<WorldState, DoorCache>();

function doorCache(state: WorldState): DoorCache {
  const epoch = walkGrid(state).epoch;
  let c = doorCaches.get(state);
  if (!c || c.epoch !== epoch) {
    c = { epoch, doors: new Map(), cells: null, wells: null };
    doorCaches.set(state, c);
  }
  return c;
}

/** The door tile of a building, or -1 when it is gone. Buildings never move, so this caches well. */
export function doorOf(state: WorldState, buildingId: EntityId): number {
  if (!buildingId) return -1;
  const c = doorCache(state);
  let door = c.doors.get(buildingId);
  if (door === undefined) {
    const b = findById(state.buildings, buildingId);
    door = b ? doorTile(b) : -1;
    c.doors.set(buildingId, door);
  }
  return door;
}

function cellsFor(state: WorldState): Building[][] {
  const c = doorCache(state);
  if (!c.cells) {
    const cells: Building[][] = Array.from({ length: CELLS * CELLS }, () => []);
    for (const b of state.buildings) {
      const door = doorTile(b);
      const x = Math.min(CELLS - 1, Math.max(0, Math.floor((door % MAP_SIZE) / CELL)));
      const z = Math.min(CELLS - 1, Math.max(0, Math.floor(Math.floor(door / MAP_SIZE) / CELL)));
      cells[z * CELLS + x]!.push(b);
    }
    c.cells = cells;
  }
  return c.cells;
}

/** Buildings that supply water (wells), any stage, in id order. */
export function wellsOf(state: WorldState): Building[] {
  const c = doorCache(state);
  if (!c.wells) {
    c.wells = state.buildings.filter((b) =>
      content.buildingById.get(b.def)?.coverage?.some((cov) => cov.kind === 'water'),
    );
  }
  return c.wells;
}

/**
 * Calls fn for every building whose door may lie within r tiles (Chebyshev) of (x, z): a superset
 * from the coarse grid, in cell order then id order. Callers check the exact distance.
 */
export function eachBuildingNear(
  state: WorldState,
  x: number,
  z: number,
  r: number,
  fn: (b: Building, door: number) => void,
): void {
  const cells = cellsFor(state);
  const cx0 = Math.max(0, Math.floor((x - r) / CELL));
  const cz0 = Math.max(0, Math.floor((z - r) / CELL));
  const cx1 = Math.min(CELLS - 1, Math.floor((x + r) / CELL));
  const cz1 = Math.min(CELLS - 1, Math.floor((z + r) / CELL));
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      for (const b of cells[cz * CELLS + cx]!) fn(b, doorOf(state, b.id));
    }
  }
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
  const living = new Map<EntityId, number>();
  for (const h of state.households) if (h.homeId) living.set(h.homeId, (living.get(h.homeId) ?? 0) + 1);
  const out: Vacancy[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const housing = content.buildingById.get(b.def)?.housing;
    if (!housing) continue;
    if ((living.get(b.id) ?? 0) < housing.households) out.push({ building: b, residents: housing.residents });
  }
  return out;
}

/** Number of residents of all stages that count as working age (adult and young). */
export function isWorkingAge(r: Resident): boolean {
  return r.stage === 'adult' || r.stage === 'young';
}
