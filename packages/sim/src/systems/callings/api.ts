// Callings' cross-track API (R3.0; R3C wrote the effects): docs/spec/15-progression.md,
// Callings. A calling is earned through the Town Book (three pages of a leaning), never chosen. The
// readers are wired already (R3.0, task 5): the specialized buildings' capacity asks callingRoom (Mill
// Town's room by the mills), charm's lantern light asks callingLanternCharm (Pilgrims' Rest).
import { content, type CallingDef } from '@qoti/content';
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
export function callingRoom(state: WorldState, specialized: Building): number {
  let n = 0;
  for (const id of state.townBook.callings) {
    const room = content.callingById.get(id)?.room;
    if (room && room.buildings.includes(specialized.def)) n += room.extra;
  }
  return n;
}

/** Light charm added to every lit lantern's night value by the town's callings (Pilgrims' Rest). */
export function callingLanternCharm(state: WorldState): number {
  let n = 0;
  for (const id of state.townBook.callings) n += content.callingById.get(id)?.lanternCharm ?? 0;
  return n;
}

/** Pilgrims' Rest's festival effect from the first earned calling that has one, or undefined. */
export function callingFestival(state: WorldState): CallingDef['festival'] {
  for (const id of state.townBook.callings) {
    const f = content.callingById.get(id)?.festival;
    if (f) return f;
  }
  return undefined;
}
