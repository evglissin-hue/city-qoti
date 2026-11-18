// The lamplighter's round (R3A; docs/spec/19-evenings.md, Supplies): from the settling (17:30) he takes
// the night's candles from the nearest storehouse and walks the lanterns, the places kept first, nearest
// first, each lamp coming on as he reaches it (`LampState.reach`). A schedule override puts the residents
// holding the job on their round: R3A adds it to the registry in residents/overrides.ts (priority 60) when
// the walk is real, returning at once for anyone not a lamplighter (every override costs every resident a
// call); the walk is there to
// be watched, and the rules never wait for it.
import type { Activity, EntityId, LampState, Resident, WorldState } from '../../contracts';

/** A lantern given a candle at the settling, in the settled order (keep first, then as it comes; nearest first; ties by id). */
export interface LitLantern {
  id: EntityId;
  tile: number;
  /** Its rank (pieces.ts Rank): the walk takes the kept ones first. */
  rank: number;
}

/**
 * Tonight's lamps (sorted by id) with the tick each is reached: the walk from `start` (the storehouse
 * the candles came from) split among `held` (the lamplighters, sorted), each lamp's `by` set; with
 * nobody holding the job every lamp comes on at `litHour` sharp and has no `by`. `night` is the day
 * index settled.
 */
export function walkLamps(
  _lit: readonly LitLantern[],
  _start: number,
  _held: readonly EntityId[],
  _night: number,
): LampState[] {
  // R3A skeleton: Executor B writes it (every lamp at litHour until then).
  return [];
}

/** Lamplighter jobs the town has now: the ceiling of tonight's lamps over 40, at least one from Village rank once a lantern stands. */
export function lamplighterJobs(_state: WorldState): number {
  // R3A skeleton: Executor B writes it.
  return 0;
}

/** The agent row's lamplighter bits: 0 not on his round, 1 walking it, 2 lighting a lamp. */
export function lamplighterPose(_state: WorldState, _r: Resident): number {
  // R3A skeleton: Executor B writes it.
  return 0;
}

/** The schedule override: what a lamplighter does this hour, or null for the day table. */
export function lamplighterRound(_state: WorldState, _r: Resident, _hour: number): Activity | null {
  // R3 stand-in (R3A): nobody holds the job, so nobody walks.
  return null;
}
