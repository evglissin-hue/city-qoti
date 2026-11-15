// The evening round (docs/spec/19-evenings.md, The round): between 17:00 and 17:30 each young and
// adult resident plans one to three stops at their own minute (builders and porters at 19:00), walks
// the pleasant way, takes a seat or standing room, and comes home at 21:00. R2A owns this file; the
// planner grows out of chooseLeisure (outings.ts) and the schedule (schedule.ts).
import type { TickCtx, WorldState } from '../../contracts';

/**
 * 17:00, before anyone plans: rolls `state.evenings.tonight` into its history and starts a fresh
 * tally, and pushes a fresh evening onto every place's saved counts (startPlaceEvening).
 *
 * R2 stand-in (R2A): nothing yet; the tally keeps day -1 and nobody plans a round.
 */
export function startEvening(_state: WorldState, _ctx: TickCtx): void {}
