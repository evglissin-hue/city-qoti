// Places draw last (R3A; docs/spec/19-evenings.md, Supplies; 13-ledger.md, The carrier and trade):
// homes are served first, then businesses, then places. A place draws only on what the town holds
// above the family's reserve and the places' winter mark, which falls through winter (the season
// plan's mark times the winter days left over the winter's length, derived, never saved; homes and
// businesses keep the flat mark), and only from the storehouses and makers' output buffers, never a
// shelf. The carrier buys for places only where the Ledger switched it on (`CarrierFamily.places`),
// within the day's budget and never on the County tab (carrier/index.ts, step 4b).
import type { WorldState } from '../../contracts';

/**
 * The places' winter mark for a family (GOOD_FAMILIES index), in days of use: the season plan's mark
 * while marks stand, falling through winter by the days left; null when no mark stands.
 */
export function placesMark(_state: WorldState, _family: number): number | null {
  // R3A skeleton: Executor A writes it.
  return null;
}

/** Units of a family the town keeps from places: its reserve or the places' mark, whichever is more. */
export function placesFloor(_state: WorldState, _family: number): number {
  // R3A skeleton: Executor A writes it.
  return 0;
}

/** What places may draw now: a family's units above its floor, and each good's free units where places take from. */
export interface PlacesPurse {
  /** By GOOD_FAMILIES index: units above the places' floor (0 at or below it). */
  surplus: number[];
  /** By good index: free units in the storehouses and makers' output buffers (never a shelf). */
  free: number[];
}

/** The purse for one settling (or one carrier visit): read once, spent by drawForPlaces. */
export function placesPurse(state: WorldState): PlacesPurse {
  // R3A skeleton: Executor A writes it.
  const n = state.carrier.families.length;
  return { surplus: new Array<number>(n).fill(0), free: [] };
}

/**
 * Takes up to `qty` units of good index `good` for places, within the purse (its family's surplus and
 * the good's free units), from the storehouses nearest tile `from` first, then makers' output buffers
 * nearest first (ties by building id). Spends the purse; returns the units taken.
 */
export function drawForPlaces(
  _state: WorldState,
  _purse: PlacesPurse,
  _good: number,
  _qty: number,
  _from: number,
): number {
  // R3A skeleton: Executor A writes it.
  return 0;
}
