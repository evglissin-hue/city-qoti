// Cafes (docs/spec/19-evenings.md, Shops follow the walkers): a shop of level 2 or more whose door is
// within 2 tiles of two or more seats puts tables out; its tables join the place and it serves there.
// R2B owns this file; R2A's place pass reads it. The levels pass sets and clears `Building.cafe`.
import { content } from '@qoti/content';
import { MAP_SIZE, TILE_FP } from '../../constants';
import type { Building, WorldState } from '../../contracts';
import { doorTile } from '../movement/api';

const S = MAP_SIZE;
/** Seats of the cafe table piece, should content ever lose its `seats`. */
const TABLE_SEATS = 4;

/** Grown-up seats of the decor pieces within `radius` tiles (Manhattan) of the building's door. */
export function seatsAtDoor(state: WorldState, b: Building, radius: number): number {
  const door = doorTile(b);
  const dx = door % S;
  const dz = Math.floor(door / S);
  let n = 0;
  for (const d of state.decor) {
    const def = content.decorById.get(d.def);
    if (!def?.seats) continue;
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    if (Math.abs(x - dx) + Math.abs(z - dz) > radius) continue;
    n += def.childSeats ? 0 : def.seats;
  }
  return n;
}

/** True when a shop of this level has the seats at its door to put tables out. */
export function wantsTables(state: WorldState, b: Building, level: number): boolean {
  const P = content.places;
  return level >= P.cafeLevel && seatsAtDoor(state, b, P.cafeRadius) >= P.cafeSeats;
}

/** Seats a shop's tables add to the place beside it (0 for a shop that has not put tables out). Reads saved state only. */
export function cafeTables(_state: WorldState, b: Building): number {
  if (!b.cafe) return 0;
  return content.decorById.get('cafe-table')?.seats ?? TABLE_SEATS;
}
