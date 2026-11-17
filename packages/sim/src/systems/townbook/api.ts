// The Town Book's cross-track API (R3.0; R3C writes what is marked a stand-in): docs/spec/19-evenings.md,
// The Town Book. The readers are wired already (R3.0, task 5): the baskets' variety asks
// specialtiesOnRound, a place's draw asks placeSpecialty and customToday, recordSale tells
// townBookSale, the conditions count pagesFound and pagesTogether.
import type { Household, Place, PlaceState, WorldState } from '../../contracts';

/**
 * Flavors of family index `family` a household gains from specialties its members' rounds pass (one
 * more flavor for each specialty of that family at a place on their round): the baskets' variety.
 */
export function specialtiesOnRound(_state: WorldState, _h: Household, _family: number): number {
  // R3 stand-in (R3C): no specialties.
  return 0;
}

/** The draw a specialty adds to a place (`TOWN_BOOK.specialtyDraw`), 0 when none is sold there. */
export function placeSpecialty(_state: WorldState, _place: Place): number {
  // R3 stand-in (R3C): no specialties.
  return 0;
}

/** The draw a custom adds to a place today (`TOWN_BOOK.customDraw`), 0 when none falls today. */
export function customToday(_state: WorldState, _place: Place): number {
  // R3 stand-in (R3C): no customs.
  return 0;
}

/**
 * A Treat sold to the round at a place (recordSale calls it once a sale, after the place's row is
 * counted): `row` is the place's saved row, `good` the good index. R3C counts customers by good.
 */
export function townBookSale(_state: WorldState, _row: PlaceState, _good: number): void {
  // R3 stand-in (R3C): nothing is counted.
}

/** True once a page of this custom (a content custom id) has been found. */
export function customFound(state: WorldState, id: string): boolean {
  for (const p of state.townBook.pages) if (p.kind === 'custom' && p.def === id) return true;
  return false;
}

/** Pages found; `ref` 'specialty' or 'custom' keeps that kind, a leaning keeps that leaning. */
export function pagesFound(state: WorldState, ref?: string): number {
  let n = 0;
  for (const p of state.townBook.pages) if (ref === undefined || p.kind === ref || p.leaning === ref) n++;
  return n;
}

/** Pages credited to two seats (Made Together). */
export function pagesTogether(state: WorldState): number {
  let n = 0;
  for (const p of state.townBook.pages) if (p.seats.length >= 2) n++;
  return n;
}
