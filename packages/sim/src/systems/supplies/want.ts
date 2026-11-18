// What places want of the town's goods tonight (R3A): the carrier's buying for places (10:00) and the
// fourth gap's words read it. Pure: reads saved state and the derived places only.
import type { WorldState } from '../../contracts';

/**
 * Units by good index places want tonight: a candle for every `per` lanterns not let rest, a fire's
 * firewood in its seasons, the cloth of pieces not yet put up this season. Pieces in a place set to
 * let rest want nothing; in a Hamlet nothing is wanted (every piece is supplied for nothing).
 */
export function placesWant(state: WorldState): number[] {
  // R3A skeleton: Executor A writes it.
  return new Array<number>(state.economy.today.produced.length).fill(0);
}
