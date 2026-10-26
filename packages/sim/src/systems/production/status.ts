// Building status bits (docs/spec/13-ledger.md, Reports: no workers, missing input, output full,
// no road, no porters, plus paused, disrepair and the construction waits). Refreshed hourly for
// every building and right away after construction milestones; a change sends building.updated.
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import { content } from '@qoti/content';
import { BuildingStatus, MAP_SIZE } from '../../constants';
import type { Building, BuildingRuntime, TickCtx, WorldState } from '../../contracts';
import { entranceTiles } from '../../rules/footprint';
import { emitBuilding } from '../economy/emit';
import { doorTile } from '../movement/api';
import { porterServed, storehouseReach, type Reach } from '../logistics/range';
import { defOf, isMarket, outputCap } from '../logistics/stores';
import { CROP_YIELD, ownedFields } from './fields';
import { countMatureTrees, FORESTRY_RANGE } from './forestry';
import { DISREPAIR_CONDITION } from './produce';

/** Builder-ticks the materials delivered so far allow (work keeps pace with deliveries). */
export function allowedWork(rt: BuildingRuntime): number {
  const c = rt.construction;
  if (!c) return 0;
  let need = 0;
  let got = 0;
  for (let i = 0; i < c.needs.length; i++) {
    need += c.needs[i]! + c.delivered[i]!;
    got += c.delivered[i]!;
  }
  if (need === 0 || got === need) return c.work;
  return Math.floor((c.work * got) / need);
}

export function materialsDue(rt: BuildingRuntime): boolean {
  const c = rt.construction;
  if (!c) return false;
  for (let i = 0; i < c.needs.length; i++) if (c.needs[i]! > 0) return true;
  return false;
}

/** Buildings that only work when the road reaches their door (spec placement "road"). */
function wantsRoad(def: BuildingDef): boolean {
  return (
    def.category === 'home' || def.category === 'storage' || isMarket(def) || !!def.tags?.includes('builders')
  );
}

/** Buildings that need porters: producers with goods in or out, and market stalls. */
function wantsPorters(def: BuildingDef, method: ProductionMethod | undefined): boolean {
  if (isMarket(def)) return true;
  return !!method && (method.inputs.length > 0 || method.outputs.length > 0);
}

/** True when an output buffer cannot take another cycle's worth. */
export function outputBlocked(def: BuildingDef, rt: BuildingRuntime, method: ProductionMethod): boolean {
  const cap = outputCap(def);
  if (method.kind === 'farm') {
    const g = content.goodIndex.get(method.outputs[0]?.[0] ?? '') ?? -1;
    return g >= 0 && rt.output[g]! + CROP_YIELD > cap;
  }
  for (const [id, qty] of method.outputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && rt.output[g]! + qty > cap) return true;
  }
  return false;
}

export function inputsShort(rt: BuildingRuntime, method: ProductionMethod): boolean {
  for (const [id, qty] of method.inputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined && rt.input[g]! < qty) return true;
  }
  return false;
}

/** Builders standing at the building's door on a task for it. */
export function buildersAt(state: WorldState, b: Building): number {
  const door = doorTile(b);
  let n = 0;
  for (const r of state.residents) {
    if (r.activity.kind === 'task' && r.activity.taskId === -b.id && !r.move && r.tile === door) n++;
  }
  return n;
}

export function computeStatus(
  state: WorldState,
  b: Building,
  def: BuildingDef,
  reaches: readonly Reach[],
): number {
  const rt = b.rt!;
  let s = 0;
  if (rt.paused) s |= BuildingStatus.paused;
  const { front } = entranceTiles(def, b.x, b.z, b.rot);
  const roadAtDoor = !!state.map.road[front[1] * MAP_SIZE + front[0]];
  if (b.stage === 'construction') {
    if (materialsDue(rt)) {
      if (!porterServed(reaches, doorTile(b, def))) s |= BuildingStatus.noPorters;
    }
    const c = rt.construction;
    if (c && c.workDone >= allowedWork(rt) && materialsDue(rt)) s |= BuildingStatus.waitingMaterials;
    else if (c && c.workDone < allowedWork(rt) && buildersAt(state, b) === 0)
      s |= BuildingStatus.waitingBuilders;
    return s;
  }
  if ((def.jobs?.count ?? 0) > 0 && rt.workers.length === 0) s |= BuildingStatus.noWorkers;
  if (wantsRoad(def) && !roadAtDoor) s |= BuildingStatus.noRoad;
  if (rt.condition < DISREPAIR_CONDITION) s |= BuildingStatus.disrepair;
  const method = def.methods?.[rt.method];
  if (wantsPorters(def, method) && !porterServed(reaches, doorTile(b, def))) s |= BuildingStatus.noPorters;
  if (!method) return s;
  if (method.kind === 'craft' && inputsShort(rt, method)) s |= BuildingStatus.missingInput;
  if (outputBlocked(def, rt, method)) s |= BuildingStatus.outputFull;
  if (method.kind === 'fell' && countMatureTrees(state, b, def, method.range ?? FORESTRY_RANGE) === 0) {
    s |= BuildingStatus.noTrees;
  }
  if (method.kind === 'farm' && ownedFields(state, b, def) === 0) s |= BuildingStatus.noFields;
  return s;
}

/** Recomputes one building's status; sends building.updated when it changed. */
export function refreshStatus(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  reaches: readonly Reach[] = storehouseReach(state),
): void {
  const def = defOf(b);
  if (!b.rt || !def) return;
  const next = computeStatus(state, b, def, reaches);
  if (next === b.rt.status) return;
  b.rt.status = next;
  emitBuilding(state, ctx, b);
}

export function refreshAllStatus(state: WorldState, ctx: TickCtx): void {
  const reaches = storehouseReach(state);
  for (const b of state.buildings) refreshStatus(state, ctx, b, reaches);
}
