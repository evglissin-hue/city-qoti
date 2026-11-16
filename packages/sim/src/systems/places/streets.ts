// Street names by road run (docs/spec/10-world-and-building.md, Roads [R2]). R2A decides what a run
// is (the lot cutter's frontage runs are the model), names each once from what stands on it, and keeps
// `state.streets` in step as roads change.
import type { Street, WorldState } from '../../contracts';

/**
 * The tiles of a street's run, sorted (for labels, the endpaper map and rename by a click).
 *
 * R2 stand-in (R2A): runs are not traced yet; a street is its anchor tile alone.
 */
export function streetTiles(_state: WorldState, street: Street): number[] {
  return [street.anchor];
}
