// Specialized buildings that grow with success (R3H; the master's ruling of 2026-11-17, from the
// owner's playtest of main): a specialized building whose def has `levels` climbs after three good days
// running (the good day its def names: goods carried, customers, everyone served, a store half full)
// and slides back after four failing days, as businesses do; a level is a bigger crew, reach, store or
// room, never a multiplier (13-ledger.md, Levels). The levels pass calls it at 23:30 for every built
// specialized building with `levels`; the readers of a level (jobs, storage, reach, capacity) are R3H's
// too. `Building.level` and `Building.counters` are saved on every building already.
import type { Building, TickCtx, WorldState } from '../../contracts';

/** One specialized building's day end: count its good day, climb or slide. */
export function specializedDayEnd(_state: WorldState, _ctx: TickCtx, _b: Building): void {
  // R3 stand-in (R3H): no specialized building has levels yet, and none climbs.
}
