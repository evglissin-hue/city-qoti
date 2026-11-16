// Street names by road run (docs/spec/10-world-and-building.md, Roads [R2]). R2A decides what a run
// is (the lot cutter's frontage runs are the model), names each once from what stands on it, and keeps
// `state.streets` in step as roads change.
import type { Street, TickCtx, WorldState } from '../../contracts';

/**
 * The tiles of a street's run, sorted (for labels, the endpaper map and rename by a click).
 *
 * R2 stand-in (R2A): runs are not traced yet; a street is its anchor tile alone.
 */
export function streetTiles(_state: WorldState, street: Street): number[] {
  return [street.anchor];
}

/**
 * The hourly pass over street names (called by the places system): names each new run once, drops a
 * row whose run is gone, emits `streets.updated` when something changed.
 *
 * R2A, in progress: filled by the streets task.
 */
export function refreshStreets(_state: WorldState, _ctx: TickCtx): void {}
