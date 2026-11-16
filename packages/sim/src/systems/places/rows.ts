// The saved rows (docs/spec/19-evenings.md, Data and budgets): what the town remembers of each place
// by its stable id. The hourly pass names a place it finds for the first time, marks every row it
// finds as seen today, and drops a row it has not found for `PLACES.forgetDays` days; it emits
// `places.updated` when something changed.
import type { TickCtx, WorldState } from '../../contracts';

/**
 * The hourly pass over the rows (called by the places system after the patterns pass).
 *
 * R2A, in progress: filled by the rows-and-names task.
 */
export function refreshRows(_state: WorldState, _ctx: TickCtx): void {}
