// The injected place index (a leaf module, so the vi.mock factory never waits on the fixtures).
import type { Place, WorldState } from '../../src/contracts';

const given = new WeakMap<WorldState, Place[]>();

/** The index the mock serves: the places given to this very state object. */
export function indexFor(state: WorldState): { places: Place[]; byId: Map<string, Place> } {
  const places = given.get(state) ?? [];
  return { places, byId: new Map(places.map((p) => [p.id, p])) };
}

export function givePlaces(state: WorldState, places: Place[]): void {
  given.set(state, places);
}
