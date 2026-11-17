// The lamplighter's round (R3A; docs/spec/19-evenings.md, Supplies): from the settling (17:30) he takes
// the night's candles from the nearest storehouse and walks the lanterns, the places kept first, nearest
// first, each lamp coming on as he reaches it (`LampState.reach`). A schedule override puts the residents
// holding the job on their round: R3A adds it to the registry in residents/overrides.ts (priority 60) when
// the walk is real, returning at once for anyone not a lamplighter (every override costs every resident a
// call); the walk is there to
// be watched, and the rules never wait for it.
import type { Activity, Resident, WorldState } from '../../contracts';

/** The schedule override: what a lamplighter does this hour, or null for the day table. */
export function lamplighterRound(_state: WorldState, _r: Resident, _hour: number): Activity | null {
  // R3 stand-in (R3A): nobody holds the job, so nobody walks.
  return null;
}
