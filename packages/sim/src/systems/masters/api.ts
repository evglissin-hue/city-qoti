// Masters' cross-track API (R3.0's signatures, R3B's bodies): docs/spec/19-evenings.md, Masters. The
// readers are wired already: the levels pass asks canReachLevel3, the specialized buildings' capacity
// asks masterRoom, the festival twists ask masterMakes, the conditions count mastersCount and
// mastersMade, and the baskets' demand asks masterGoodsInTown. Everything here reads saved state
// (the crews, the master flag, stock), so a seat joining from a snapshot reads what its partner reads.
import { content, type MasterDef } from '@qoti/content';
import type { Building, BusinessCounters, EntityId, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { MASTER_GOOD_IDS, residentIsMaster } from '../../state/masters';
import { townStock } from '../../view/hamlet';

/** True when the resident is a master (of the trade in `Resident.mastery`). */
export function isMaster(r: Resident): boolean {
  return residentIsMaster(r);
}

/** What a building is a master of, if anyone: its trade for a business, else its def id. */
export function masteryKey(b: Pick<Building, 'def' | 'trade'>): string {
  return b.trade ?? b.def;
}

/**
 * The master on this business's crew (or at this specialized building): a worker who is a master of
 * its trade (or its def, for a specialized building). 0 when none; the lowest id when several.
 */
export function masterOf(state: WorldState, b: Building): EntityId {
  const trade = masteryKey(b);
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

/** The master's def for a trade or a specialized building, if it has masters. */
export function masterDefOf(trade: string): MasterDef | undefined {
  return content.masterByOf.get(trade);
}

/**
 * The levels pass (systems/levels): may this business climb to level 3, as far as masters go? A
 * master of its trade on the crew, for a trade whose masters bring level 3 (13-ledger.md, Levels).
 * Its other terms (custom, inputs and a street) are the levels pass's own, and so is keeping level 3
 * (`levelKept`, the six days' grace).
 */
export function canReachLevel3(state: WorldState, b: Building, _c: BusinessCounters): boolean {
  if (!masterDefOf(masteryKey(b))?.level3) return false;
  return masterOf(state, b) !== 0;
}

/**
 * Extra businesses a specialized building may serve for its masters (the master miller makes room for
 * one more baker, `MasterDef.room`): read by `capacityOf` (systems/specialized/api.ts). One while a
 * master of the building works there, else 0.
 */
export function masterRoom(state: WorldState, specialized: Building): number {
  if (specialized.trade || specialized.stage !== 'built') return 0;
  if (!masterDefOf(specialized.def)?.room) return 0;
  return masterOf(state, specialized) !== 0 ? 1 : 0;
}

/**
 * A master's good is made in town now: a master of the trade that makes it works where it is made
 * (on the crew of a built business of that trade, or at that specialized building). Festival twists
 * ask, as for any good: the pie contest waits for a master baker.
 */
export function masterMakes(state: WorldState, good: string): boolean {
  if (!MASTER_GOOD_IDS.has(good)) return false;
  for (const m of content.masters) {
    if (m.good !== good) continue;
    for (const b of state.buildings) {
      if (b.stage !== 'built' || masteryKey(b) !== m.of) continue;
      if (masterOf(state, b) !== 0) return true;
    }
  }
  return false;
}

/**
 * By good index: true for a master's good the town has now, made by a master today or still in stock
 * somewhere (stores, shelves, buffers). Only these are wanted: a household asks for a master's good
 * while the town has it, so a good no master ever made is no flavor anybody wants or misses, and one
 * whose last master left stops being asked for once the last of it is sold (19-evenings.md, Masters:
 * losing one). Every other good reads false. Pass `stock` when the caller has townStock at hand.
 */
export function masterGoodsInTown(state: WorldState, stock?: readonly number[]): boolean[] {
  const out = new Array<boolean>(content.goods.length).fill(false);
  let have: readonly number[] | undefined = stock;
  for (const m of content.masters) {
    if (m.good === undefined) continue;
    const g = content.goodIndex.get(m.good);
    if (g === undefined) continue;
    have ??= townStock(state);
    out[g] = (have[g] ?? 0) > 0 || masterMakes(state, m.good);
  }
  return out;
}

/** The resident's master title ("master baker"), or undefined. */
export function masterTitle(r: Resident): string | undefined {
  if (!residentIsMaster(r) || r.mastery === undefined) return undefined;
  return masterDefOf(r.mastery)?.title;
}

/** The building a master keeps (`Building.masterId`), if any. */
export function keptBy(state: WorldState, id: EntityId): Building | undefined {
  for (const b of state.buildings) if (b.masterId === id) return b;
  return undefined;
}

/** The resident record of a building's master (`Building.masterId`), if they are still in town. */
export function masterResident(state: WorldState, b: Building): Resident | undefined {
  return b.masterId ? findById(state.residents, b.masterId) : undefined;
}
