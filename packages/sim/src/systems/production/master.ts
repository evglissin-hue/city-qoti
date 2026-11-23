// The master's own cycle (docs/spec/19-evenings.md, Masters: what a master brings). While a master of
// the building's key works inside it, their own hands go to the master's recipe (`MasterDef.method`):
// the master's good, made in this building from the raw good the trade already takes. Their work
// leaves the trade's crew work while the lane runs, so it is never a multiplier; when the lane cannot
// run (no raw good, a full buffer) the master works the trade's recipe like any hand. A gatherer's
// master (jam from the orchard's fruit, mead from the hives' honey, smoked fish from the fishery's
// fish) may take the raw good from the building's own output. A short lane never counts as a short
// day (`countShort`): the trade's reliability is the trade's lane.
import { content, type MasterDef, type ProductionMethod } from '@qoti/content';
import type { Building, BuildingRuntime, EntityId, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { residentIsMaster } from '../../state/masters';
import { countSold } from '../levels/counters';
import { masterDefOf, masteryKey } from '../masters/api';
import { outputCap } from '../logistics/stores';
import { productivity } from '../logistics/tasks';
import { yieldPermille } from './modifiers';
import { conditionPercent, consume, cycleWork, produce } from './produce';
import type { BuildingDef } from '@qoti/content';

/** The master at work inside this building, with their def, when the master's lane could start. */
function laneMaster(
  state: WorldState,
  b: Building,
): { r: Resident; def: MasterDef; method: ProductionMethod } | undefined {
  if (!b.masterId) return undefined;
  const def = masterDefOf(masteryKey(b));
  const method = def?.method;
  if (!def || !method) return undefined;
  const r = findById(state.residents, b.masterId);
  if (!r || !residentIsMaster(r) || r.mastery !== masteryKey(b) || r.inside !== b.id) return undefined;
  return { r, def, method };
}

/** Units of a raw good the master may use: the input buffer plus what is free in the output buffer. */
function available(rt: BuildingRuntime, g: number): number {
  return rt.input[g]! + Math.max(0, rt.output[g]! - rt.reservedOut[g]!);
}

function canRunLane(def: BuildingDef, rt: BuildingRuntime, method: ProductionMethod): boolean {
  const cap = outputCap(def);
  for (const [id, qty] of method.inputs) {
    const g = content.goodIndex.get(id);
    if (g === undefined || available(rt, g) < qty) return false;
  }
  for (const [id, qty] of method.outputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && rt.output[g]! + qty > cap) return false;
  }
  return true;
}

/**
 * Runs the master's lane for one tick. Returns the master's id while the lane is running (the trade's
 * crew work leaves them out), else 0.
 */
export function masterWork(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  rt: BuildingRuntime,
): EntityId {
  const m = laneMaster(state, b);
  if (!m || !canRunLane(def, rt, m.method)) return 0;
  const permille = yieldPermille(state, b, def, m.method);
  let power = Math.floor((productivity(m.r) * conditionPercent(rt)) / 100);
  if (permille !== 1000) power = Math.floor((power * permille) / 1000);
  rt.masterProgress = (rt.masterProgress ?? 0) + power;
  const cycle = cycleWork(m.method);
  if (rt.masterProgress < cycle) return m.r.id;
  rt.masterProgress -= cycle;
  // Inputs: the input buffer first, then the building's own output (canRunLane checked there is enough).
  for (const [id, qty] of m.method.inputs) {
    const g = content.goodIndex.get(id);
    if (g === undefined) continue;
    const fromInput = Math.min(rt.input[g]!, qty);
    rt.input[g]! -= fromInput;
    rt.output[g]! -= qty - fromInput;
    // The trade's own good, used here, is custom for its level as much as a porter's pickup: an
    // orchard whose master boils jam from its fruit must not read as unsold (steady custom, levels).
    countSold(b, qty - fromInput);
    consume(state, g, qty);
  }
  for (const [id, qty] of m.method.outputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) produce(state, ctx, b, g, qty);
  }
  return m.r.id;
}
