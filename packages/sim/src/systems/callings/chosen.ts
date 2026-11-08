// What the village chose to be known for, readable from anywhere without pulling the rest of the
// callings code in (the festival, charm and growth hooks all read it).
import { content, type CallingDef } from '@qoti/content';
import type { WorldState } from '../../contracts';

/** The chosen calling's definition, or null while there is none (or the valley has no offer). */
export function chosenCalling(state: WorldState): CallingDef | null {
  const id = state.calling?.chosen;
  return id ? (content.callingById.get(id) ?? null) : null;
}

/** True when the valley's calling is `id`. */
export function hasCalling(state: WorldState, id: string): boolean {
  return state.calling?.chosen === id;
}

/** True while an offer is open: made, and not yet chosen. */
export function offerOpen(state: WorldState): boolean {
  return !!state.calling && state.calling.chosen === null;
}
