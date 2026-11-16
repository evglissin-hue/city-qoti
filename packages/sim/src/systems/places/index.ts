// The place pass (docs/spec/19-evenings.md, Places): every hour after the patterns pass, and after a
// Hearth command nearby, the sim finds the town's places (pattern sites, sitting spots, porches,
// hosts) and gives each its seats, kinds, shelter, outlets and draw. Places are derived, never saved:
// the index below is rebuilt from saved state, so a seat joining from a snapshot sees what its
// partner sees (the determinism rule on `Place` in contracts/evenings.ts). The pass also keeps the
// saved rows (`state.places`: names and the evening counts) in step with what it finds.
import { TICKS_PER_HOUR } from '../../constants';
import type { Place, PlaceId, System, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { PATTERNS_OFFSET } from '../hearth/patterns';

/** The derived places, sorted by id, and a lookup by id. Never serialized, never hashed. */
export interface PlaceIndex {
  places: Place[];
  byId: Map<PlaceId, Place>;
}

const indexes = new WeakMap<WorldState, PlaceIndex>();

/**
 * The town's places now. A pure function of saved state at the moment it is read: R2A rebuilds the
 * index when one of its inputs changed (decor, buildings, sites, the charm layer, the hour, the
 * season, the ice, the festival) and never caches what moves between those (stock).
 *
 * R2 stand-in (R2A): finds no places, so nobody goes out and every evening scores the floor.
 */
export function placeIndex(state: WorldState): PlaceIndex {
  let index = indexes.get(state);
  if (!index) {
    index = { places: [], byId: new Map() };
    indexes.set(state, index);
  }
  return index;
}

/** Drops the cached index (a Hearth command nearby, a building grown or gone); the next read rebuilds it. */
export function invalidatePlaces(state: WorldState): void {
  indexes.delete(state);
}

export const places: System = {
  id: 'places',
  order: 73,
  every: TICKS_PER_HOUR,
  offset: PATTERNS_OFFSET,
  tick(state) {
    if (!isStandard(state)) return;
    // R2 stand-in (R2A): no pass yet. R2A finds places, refreshes `state.places` (new rows named,
    // seenDay, rows past PLACES.forgetDays dropped), pushes a fresh evening at 17:00 and emits
    // places.updated when something changed.
    placeIndex(state);
  },
};
