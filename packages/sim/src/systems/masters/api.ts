// Masters' cross-track API (R3.0; R3B writes what is marked a stand-in): docs/spec/19-evenings.md,
// Masters. The readers are wired already (R3.0, task 5): the levels pass asks canReachLevel3, the
// specialized buildings' capacity asks masterRoom, the conditions count mastersCount and mastersMade.
// isMaster, masterOf and mastersCount read the saved flag and are real from R3.0.
import { content } from '@qoti/content';
import type { Building, BusinessCounters, EntityId, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { residentIsMaster } from '../../state/masters';

/** True when the resident is a master (of the trade in `Resident.mastery`). */
export function isMaster(r: Resident): boolean {
  return residentIsMaster(r);
}

/**
 * The master on this business's crew (or at this specialized building): a worker who is a master of
 * its trade (or its def, for a specialized building). 0 when none; the lowest id when several.
 */
export function masterOf(state: WorldState, b: Building): EntityId {
  const trade = b.trade ?? b.def;
  const workers = b.rt?.workers;
  if (!workers) return 0;
  for (const id of workers) {
    const r = findById(state.residents, id);
    if (r && residentIsMaster(r) && r.mastery === trade) return id;
  }
  return 0;
}

/** Masters in town now; with `trade`, only that trade's (a trade id or a specialized building's def id). */
export function mastersCount(state: WorldState, trade?: string): number {
  let n = 0;
  for (const r of state.residents)
    if (residentIsMaster(r) && (trade === undefined || r.mastery === trade)) n++;
  return n;
}

/** Masters ever made in the valley (Master of the House). */
export function mastersMade(state: WorldState): number {
  return state.masters.made;
}

/** Working days a keeper must have kept a business before level 3 (R1's stand-in for a master). */
export const KEEPER_DAYS_L3 = 20;

/**
 * The levels pass (systems/levels): may this business climb to level 3, as far as masters go?
 * (Its other terms, custom, inputs and a street, are the levels pass's own.)
 */
export function canReachLevel3(_state: WorldState, _b: Building, c: BusinessCounters): boolean {
  // R3 stand-in (R3B): the keeper's working days stand in for a master, as before R3.
  return c.keeperDays >= KEEPER_DAYS_L3;
}

/**
 * Extra businesses a specialized building may serve for its masters (the master miller makes room for
 * one more baker): read by `capacityOf` (systems/specialized/api.ts).
 */
export function masterRoom(_state: WorldState, _specialized: Building): number {
  // R3 stand-in (R3B): no master makes room.
  return 0;
}

/**
 * A master's good is made in town now: a master of the trade that makes it works where it is made
 * (festival twists ask, as for any good: the pie contest waits for a master baker).
 */
export function masterMakes(_state: WorldState, _good: string): boolean {
  // R3 stand-in (R3B): no master makes anything yet.
  return false;
}

/** The master's def for a trade or a specialized building, if it has masters. */
export function masterDefOf(trade: string) {
  return content.masterByOf.get(trade);
}
