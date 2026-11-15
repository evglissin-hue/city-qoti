// Cafes (docs/spec/19-evenings.md, Shops follow the walkers): a shop of level 2 or more whose door is
// within 2 tiles of two or more seats puts tables out; its tables join the place and it serves there.
// R2B owns this file; R2A's place pass reads it.
import type { Building, WorldState } from '../../contracts';

/**
 * Seats a shop's tables add to the place beside it (0 for a shop that has not put tables out).
 *
 * R2 stand-in (R2B): no shop puts tables out yet.
 */
export function cafeTables(_state: WorldState, _b: Building): number {
  return 0;
}
