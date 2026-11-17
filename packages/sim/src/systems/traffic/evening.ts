// R2 (R2B): evening streets for carts (docs/spec/19-evenings.md, Evening streets). From
// `PLACES.eveningHour` to `PLACES.homeHour` a road tile flagged `Flags.evening` is closed to carts
// and barrows, whatever the linger setting. The window is a pure function of the tick, so every
// client closes the street on the same tick.
import { content } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';
import type { WorldState } from '../../contracts';
import { Flags } from '../../map/layers';
import { tickOfDay } from '../economy/time';

/** True from eveningHour to homeHour: evening streets are closed to carts and barrows. */
export function eveningClosed(state: WorldState): boolean {
  const t = tickOfDay(state.tick);
  return t >= content.places.eveningHour * TICKS_PER_HOUR && t < content.places.homeHour * TICKS_PER_HOUR;
}

/** True when the tile is a road marked an evening street (open or closed right now). */
export function eveningTile(state: WorldState, tile: number): boolean {
  return (state.map.flags[tile]! & Flags.evening) !== 0 && state.map.road[tile]! !== 0;
}

/** True when the tile is an evening street and the street is closed now. */
export function closedTile(state: WorldState, tile: number): boolean {
  return eveningClosed(state) && eveningTile(state, tile);
}

/** True when any tile of `path` from index `from` on is a closed evening street. */
export function crossesClosed(state: WorldState, path: readonly number[], from: number): boolean {
  if (!eveningClosed(state)) return false;
  for (let k = from; k < path.length; k++) if (eveningTile(state, path[k]!)) return true;
  return false;
}

/**
 * A change counter for the route cache: `road.setEvening` bumps it, so routes planned under the old
 * flags are dropped. Derived and never saved or hashed; a new state starts a new count.
 */
const epochs = new WeakMap<WorldState, number>();

export function eveningEpoch(state: WorldState): number {
  return epochs.get(state) ?? 0;
}

/** Called by `road.setEvening` after it flips tiles. */
export function noteEveningChange(state: WorldState): void {
  epochs.set(state, eveningEpoch(state) + 1);
}
