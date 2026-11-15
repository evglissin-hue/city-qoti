// The places' cross-track API (docs/build/r2-wave-notes.md, Cross-track APIs). Signatures fixed by
// R2.0; R2A owns the bodies. R2B and R2C call these, never the place pass itself.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { EntityId, Place, PlaceId, Resident, WorldState } from '../../contracts';
import { placeState } from '../../state/evenings';
import { placeIndex } from './index';

const S = MAP_SIZE;

/** Places whose anchor tile lies within `radius` tiles of `tile` (Manhattan, as chooseLeisure measures), sorted by id. */
export function placesNear(state: WorldState, tile: number, radius: number): Place[] {
  const x = tile % S;
  const z = (tile - x) / S;
  const out: Place[] = [];
  for (const p of placeIndex(state).places) {
    const px = p.tile % S;
    const pz = (p.tile - px) / S;
    if (Math.abs(px - x) + Math.abs(pz - z) <= radius) out.push(p);
  }
  return out;
}

/** A place by its stable id, or undefined when the pass does not find it now. */
export function placeById(state: WorldState, id: PlaceId): Place | undefined {
  return placeIndex(state).byId.get(id);
}

/**
 * The outlets serving a place right now: its `outlets` with Treats on the shelf (read live, never
 * cached in the index).
 *
 * R2 stand-in (R2A): serves nothing.
 */
export function placeServes(_state: WorldState, _place: Place): EntityId[] {
  return [];
}

/** A place's draw now, 0 to 100: its cached draw plus the live Treats part (`PLACES.treatsBonus`). */
export function placeDraw(state: WorldState, place: Place): number {
  const treats = placeServes(state, place).length > 0 ? content.places.treatsBonus : 0;
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
  _outlet: EntityId,
  _good: number,
  qty: number,
  pennies: number,
): void {
  const tally = state.evenings.tonight;
  tally.takings += pennies;
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
  row.takings[last]! += pennies;
}
