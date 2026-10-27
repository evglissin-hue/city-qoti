// Production (docs/spec/13-ledger.md, I1 buildings). Each tick, every built, unpaused producer
// with workers inside adds their work to its cycle; a cycle completes when its work is done, its
// inputs are in the input buffer and its output buffer has room. Kinds:
//   craft   inputs to outputs (sawpit, windmill, bakery)
//   gather  outputs from nothing (quarry, fisher's hut, vegetable plot)
//   fell    a mature tree in range becomes logs (woodcutter)
//   plant   a sapling in range (forester)
//   farm    painted field tiles grow and are harvested for wheat (farmhouse), in steps
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import { content } from '@qoti/content';
import { BuildingStatus, TICKS_PER_HOUR } from '../../constants';
import type { Building, BuildingRuntime, System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { tickOfDay } from '../economy/time';
import { defOf } from '../logistics/stores';
import { CROP_STEP_TICKS, tendFields } from './fields';
import { FORESTRY_RANGE, fellTree, plantSapling, treeToFell } from './forestry';
import { yieldPermille } from './modifiers';
import { conditionPercent, consume, crewPower, cycleWork, heightPercent, produce } from './produce';
import { inputsShort, outputBlocked, refreshAllStatus } from './status';

const FARM_OFFSET = 7;
const STATUS_OFFSET = 20;

export const production: System = {
  id: 'production',
  order: 30,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const farmStep = state.tick % CROP_STEP_TICKS === FARM_OFFSET;
    for (const b of state.buildings) {
      const rt = b.rt;
      if (!rt || b.stage !== 'built' || rt.paused) continue;
      const def = defOf(b);
      const method = def?.methods?.[rt.method];
      if (!def || !method) continue;
      if (method.kind === 'farm') {
        if (farmStep) farm(state, ctx, b, def, rt, method);
      } else {
        work(state, ctx, b, def, rt, method);
      }
    }
    if (tickOfDay(state.tick) % TICKS_PER_HOUR === STATUS_OFFSET) refreshAllStatus(state, ctx);
  },
};

/** Work per tick from the crew inside, after condition and the height bonus. */
export function crewWork(
  state: WorldState,
  b: Building,
  def: BuildingDef,
  rt: BuildingRuntime,
  method: ProductionMethod,
): number {
  const crew = crewPower(state, b, rt, Math.max(1, method.workers));
  if (crew === 0) return 0;
  const work = Math.floor((crew * conditionPercent(rt) * heightPercent(state, b, def, method)) / 10000);
  // I3 (C5.0): weather, pollinators, pests and the like, through the yield hook.
  const p = yieldPermille(state, b, def, method);
  return p === 1000 ? work : Math.floor((work * p) / 1000);
}

function canRun(rt: BuildingRuntime, def: BuildingDef, method: ProductionMethod): boolean {
  if (method.kind === 'craft' && inputsShort(rt, method)) return false;
  if (method.kind === 'fell' && rt.status & BuildingStatus.noTrees) return false;
  return !outputBlocked(def, rt, method);
}

function work(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  rt: BuildingRuntime,
  method: ProductionMethod,
): void {
  if (!canRun(rt, def, method)) return;
  const power = crewWork(state, b, def, rt, method);
  if (power === 0) return;
  const cycle = cycleWork(method);
  rt.progress += power;
  if (rt.progress < cycle) return;
  rt.progress = finishCycle(state, ctx, b, def, rt, method) ? rt.progress - cycle : cycle;
}

/** Completes a cycle. False when it could not (a fell with no tree left in reach). */
function finishCycle(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  rt: BuildingRuntime,
  method: ProductionMethod,
): boolean {
  if (method.kind === 'fell') {
    const tile = treeToFell(state, b, def, method.range ?? FORESTRY_RANGE);
    if (tile < 0) {
      rt.status |= BuildingStatus.noTrees;
      return false;
    }
    fellTree(state, ctx, tile);
  }
  if (method.kind === 'plant') {
    plantSapling(state, ctx, b, def, method.range ?? FORESTRY_RANGE, ctx.rng('misc'));
    return true;
  }
  for (const [id, qty] of method.inputs) {
    const g = content.goodIndex.get(id);
    if (g === undefined) continue;
    rt.input[g]! -= qty;
    consume(state, g, qty);
  }
  for (const [id, qty] of method.outputs) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) produce(state, ctx, b, g, qty);
  }
  return true;
}

function farm(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  def: BuildingDef,
  rt: BuildingRuntime,
  method: ProductionMethod,
): void {
  const crew = crewPower(state, b, rt, Math.max(1, method.workers));
  if (crew === 0) return;
  const wheat = content.goodIndex.get(method.outputs[0]?.[0] ?? 'wheat');
  if (wheat === undefined) return;
  const work = Math.floor((crew * conditionPercent(rt)) / 100);
  const p = yieldPermille(state, b, def, method);
  tendFields(state, ctx, b, def, p === 1000 ? work : Math.floor((work * p) / 1000), wheat);
}
