// Callings' cross-track API (R3.0; R3C writes what is marked a stand-in): docs/spec/15-progression.md,
// Callings. A calling is earned through the Town Book (three pages of a leaning), never chosen. The
// readers are wired already (R3.0, task 5): the specialized buildings' capacity asks callingRoom (Mill
// Town's room by the mills), charm's lantern light asks callingLanternCharm (Pilgrims' Rest).
import type { Building, WorldState } from '../../contracts';

/** True once the town has earned the calling. */
export function hasCalling(state: WorldState, id: string): boolean {
  return state.townBook.callings.includes(id);
}

/** Callings earned; with `id`, 1 once that one is earned. */
export function callingsCount(state: WorldState, id?: string): number {
  return id === undefined ? state.townBook.callings.length : hasCalling(state, id) ? 1 : 0;
}

/** Extra businesses a specialized building may serve for the town's callings (Mill Town: one more by each mill). */
export function callingRoom(_state: WorldState, _specialized: Building): number {
  // R3 stand-in (R3C): no calling makes room.
  return 0;
}

/** Light charm added to every lit lantern's night value by the town's callings (Pilgrims' Rest). */
export function callingLanternCharm(_state: WorldState): number {
  // R3 stand-in (R3C): no calling adds light.
  return 0;
}
