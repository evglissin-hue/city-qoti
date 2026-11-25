// The places' cross-track API (docs/build/r2-wave-notes.md, Cross-track APIs). Signatures fixed by
// R2.0; R2A owns the bodies. R2B and R2C call these, never the place pass itself.
import { townBookSale } from '../townbook/api';
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { EntityId, Place, PlaceId, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { placeState } from '../../state/evenings';
import { treatsOnShelf } from '../market/round';
import { placeIndex, type PlaceIndex } from './index';

const S = MAP_SIZE;

/** Side of a cell of the places' anchor grid, in tiles. */
const CELL = 16;
const CELLS = Math.ceil(S / CELL);

/** Places' slots (their order in the index, by id) by the cell of their anchor tile; built once per index. */
const grids = new WeakMap<PlaceIndex, number[][]>();

function gridOf(index: PlaceIndex): number[][] {
  let grid = grids.get(index);
  if (!grid) {
    grid = Array.from({ length: CELLS * CELLS }, () => []);
    const places = index.places;
    for (let i = 0; i < places.length; i++) {
      const tile = places[i]!.tile;
      const x = tile % S;
      const z = (tile - x) / S;
      grid[Math.floor(z / CELL) * CELLS + Math.floor(x / CELL)]!.push(i);
    }
    grids.set(index, grid);
  }
  return grid;
}

/** Places whose anchor tile lies within `radius` tiles of `tile` (Manhattan, as chooseLeisure measures), sorted by id. */
export function placesNear(state: WorldState, tile: number, radius: number): Place[] {
  const x = tile % S;
  const z = (tile - x) / S;
  const index = placeIndex(state);
  const places = index.places;
  const grid = gridOf(index);
  const slots: number[] = [];
  const cz0 = Math.max(0, Math.floor((z - radius) / CELL));
  const cz1 = Math.min(CELLS - 1, Math.floor((z + radius) / CELL));
  const cx0 = Math.max(0, Math.floor((x - radius) / CELL));
  const cx1 = Math.min(CELLS - 1, Math.floor((x + radius) / CELL));
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      for (const i of grid[cz * CELLS + cx]!) {
        const t = places[i]!.tile;
        const px = t % S;
        const pz = (t - px) / S;
        if (Math.abs(px - x) + Math.abs(pz - z) <= radius) slots.push(i);
      }
    }
  }
  // Slots are the index's order, which is by id.
  slots.sort(ascending);
  const out = new Array<Place>(slots.length);
  for (let k = 0; k < slots.length; k++) out[k] = places[slots[k]!]!;
  return out;
}

function ascending(a: number, b: number): number {
  return a - b;
}

/** A place by its stable id, or undefined when the pass does not find it now. */
export function placeById(state: WorldState, id: PlaceId): Place | undefined {
  return placeIndex(state).byId.get(id);
}

/**
 * The outlets serving a place right now: its `outlets` with Treats on the shelf (read live, never
 * cached in the index; R2B's treatsOnShelf decides what is on a shelf).
 */
export function placeServes(state: WorldState, place: Place): EntityId[] {
  const out: EntityId[] = [];
  for (const id of place.outlets) {
    const b = findById(state.buildings, id);
    if (b && treatsOnShelf(state, b)) out.push(id);
  }
  return out;
}

/** True when some outlet of the place has Treats on the shelf now (placeServes, without the list). */
function servesAny(state: WorldState, place: Place): boolean {
  for (const id of place.outlets) {
    const b = findById(state.buildings, id);
    if (b && treatsOnShelf(state, b)) return true;
  }
  return false;
}

/** A place's draw now, 0 to 100: its cached draw plus the live Treats part (`PLACES.treatsBonus`). */
export function placeDraw(state: WorldState, place: Place): number {
  const treats = servesAny(state, place) ? content.places.treatsBonus : 0;
  return Math.max(0, Math.min(100, place.draw + treats));
}

/**
 * A resident reached a stop at a place (R2A's arrivals call it once per stop): counts the visitor
 * on the place's saved row for the evening under way. `flags` are the stop's RoundFlags.
 */
export function recordVisit(state: WorldState, place: PlaceId, _resident: Resident, _flags: number): void {
  const row = placeState(state, place);
  if (!row) return;
  const last = row.visitors.length - 1;
  if (last >= 0) row.visitors[last]! += 1;
}

/**
 * A Treat sold to the round (R2B's evening trade calls it): `place` is the stop it was sold at, or
 * null for passing trade; `qty` units of good index `good` from `outlet` for `pennies` (0 in a
 * Hamlet). Counts it on the place's row and the town's tally; the money itself moves in R2B's code.
 */
export function recordSale(
  state: WorldState,
  place: PlaceId | null,
  outlet: EntityId,
  good: number,
  qty: number,
  pennies: number,
): void {
  const tally = state.evenings.tonight;
  tally.takings += pennies;
  // R3.0: the outlet's own evening customers (one a sale), for "a shop nobody passes" (Building.roundSales).
  countRoundSale(state, outlet);
  if (place === null) {
    tally.treatsPassing += qty;
    return;
  }
  tally.treatsAtStops += qty;
  const row = placeState(state, place);
  if (!row) return;
  const last = row.sold.length - 1;
  if (last < 0) return;
  row.sold[last]! += qty;
  if (row.served[last] === 0) row.served[last] = 1;
  row.takings[last]! += pennies;
  // R3.0: the Town Book counts customers by good at the place (R3C's body).
  townBookSale(state, row, good);
}

/** One more round customer at the outlet's door tonight (Building.roundSales: by the evening's day). */
function countRoundSale(state: WorldState, outlet: EntityId): void {
  const b = findById(state.buildings, outlet);
  if (!b) return;
  const day = state.evenings.tonight.day;
  if (b.roundSales && b.roundSales.day === day) b.roundSales.customers += 1;
  else b.roundSales = { day, customers: 1 };
}
