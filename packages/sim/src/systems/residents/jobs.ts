// Jobs (docs/spec/11-residents.md and the I1 wave notes): adults and young residents take the
// open job that matters most (food first, see slotPriority), nearest first among equals; they are
// released when the building goes or is paused, and `present` always equals the workers inside
// their workplace. Each hour one worker may move from a less important job to a more important
// open one, so a new farm or fishery gets hands even when everyone is already employed.
import { content, type BuildingDef } from '@qoti/content';
import type { Building, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { setInside } from '../movement/api';
import { doorOf, householdOf, isWorkingAge, manhattan } from './places';
import { pushHistory } from './records';

/** Open job slots at a built building, or 0 (paused buildings hire nobody). */
export function openJobs(b: Building): number {
  if (b.stage !== 'built' || !b.rt || b.rt.paused) return 0;
  const count = content.buildingById.get(b.def)?.jobs?.count ?? 0;
  return Math.max(0, count - b.rt.workers.length);
}

const FOOD = new Set(content.goods.filter((g) => g.food).map((g) => g.id));

/** Does the building make food (or the grain that becomes it)? */
function makesFood(def: BuildingDef): boolean {
  return (def.methods ?? []).some((m) => m.kind === 'farm' || m.outputs.some(([g]) => FOOD.has(g)));
}

/**
 * How much the k-th job at a building matters, lower first: 0 food, 1 the first two builders and the
 * first two porters of each storehouse (and stall vendors), 2 everything else that makes things,
 * 3 the remaining builders and porters. A hamlet of eight then feeds itself before it hauls.
 */
export function slotPriority(def: BuildingDef, k: number): number {
  const role = def.jobs?.role ?? 'worker';
  if (role === 'builder') return k < 2 ? 1 : 3;
  if (role === 'porter') return k < 2 ? 1 : 3;
  if (role === 'vendor') return 1;
  return makesFood(def) ? 0 : 2;
}

/** Total open job slots in town. */
export function openJobCount(state: WorldState): number {
  let n = 0;
  for (const b of state.buildings) n += openJobs(b);
  return n;
}

function insertSorted(list: number[], id: number): void {
  let i = list.length;
  while (i > 0 && list[i - 1]! > id) i--;
  if (list[i - 1] !== id) list.splice(i, 0, id);
}

/** Gives the resident a job at the building (moving the present count if they are inside). */
export function hire(state: WorldState, r: Resident, b: Building): void {
  if (!b.rt) return;
  const inside = r.inside;
  if (inside) setInside(state, r, 0);
  r.jobId = b.id;
  insertSorted(b.rt.workers, r.id);
  if (inside) setInside(state, r, inside);
  pushHistory(state, r, 'job', b.id);
}

/** Ends the resident's job. `lost` logs it (the workplace went away). */
export function release(state: WorldState, r: Resident, lost = false): void {
  if (!r.jobId) return;
  const b = findById(state.buildings, r.jobId);
  const inside = r.inside;
  if (inside) setInside(state, r, 0);
  if (b?.rt) {
    const i = b.rt.workers.indexOf(r.id);
    if (i >= 0) b.rt.workers.splice(i, 1);
  }
  if (lost) pushHistory(state, r, 'job-lost', r.jobId);
  r.jobId = 0;
  if (inside && b) setInside(state, r, inside);
  if (r.activity.kind === 'work' || r.activity.kind === 'commute' || r.activity.kind === 'task') {
    r.activity = { kind: 'home' };
  }
}

/** Can this resident take a job? Working age, housed, settled in and not on their way out. */
function jobSeeker(state: WorldState, r: Resident): boolean {
  if (r.jobId || !isWorkingAge(r)) return false;
  const k = r.activity.kind;
  if (k === 'arrive' || k === 'leave') return false;
  return !!householdOf(state, r)?.homeId;
}

/** Priority of a building's next open slot (Infinity when it has none). */
function openPriority(b: Building): number {
  if (openJobs(b) <= 0) return Infinity;
  const def = content.buildingById.get(b.def);
  return def ? slotPriority(def, b.rt!.workers.length) : Infinity;
}

/**
 * Fills open jobs: each job seeker (by id) takes the most important open job (slotPriority), the
 * nearest by walking distance from home among equals (Manhattan between doors; ties by building
 * id). Returns the number hired.
 */
export function assignJobs(state: WorldState, _ctx: TickCtx, only?: Resident): number {
  const open: Building[] = [];
  for (const b of state.buildings) if (openJobs(b) > 0) open.push(b);
  if (open.length === 0) return 0;
  let hired = 0;
  const seekers = only ? [only] : state.residents;
  for (const r of seekers) {
    if (!jobSeeker(state, r)) continue;
    const homeDoor = doorOf(state, householdOf(state, r)!.homeId);
    let best: Building | null = null;
    let bestP = Infinity;
    let bestD = Infinity;
    for (const b of open) {
      const p = openPriority(b);
      if (p === Infinity) continue;
      const d = manhattan(homeDoor, doorOf(state, b.id));
      if (p < bestP || (p === bestP && d < bestD)) {
        bestP = p;
        bestD = d;
        best = b;
      }
    }
    if (!best) break;
    hire(state, r, best);
    hired++;
  }
  return hired;
}

/**
 * Moves at most one worker an hour from the least important filled job to the most important
 * open one, when the open one matters more. Workers out on a Ledger task finish it first.
 */
export function rebalanceJobs(state: WorldState): boolean {
  let target: Building | null = null;
  let targetP = Infinity;
  for (const b of state.buildings) {
    const p = openPriority(b);
    if (p < targetP) {
      targetP = p;
      target = b;
    }
  }
  if (!target) return false;
  let from: Resident | null = null;
  let fromP = targetP;
  for (const b of state.buildings) {
    const rt = b.rt;
    const def = content.buildingById.get(b.def);
    if (!rt || !def || b === target || rt.workers.length === 0) continue;
    const p = slotPriority(def, rt.workers.length - 1);
    if (p <= fromP) continue;
    // The newest hand at that building moves; never someone mid-task.
    for (let i = rt.workers.length - 1; i >= 0; i--) {
      const r = findById(state.residents, rt.workers[i]!);
      if (!r || r.activity.kind === 'task' || r.carry) continue;
      fromP = p;
      from = r;
      break;
    }
  }
  if (!from) return false;
  release(state, from);
  hire(state, from, target);
  return true;
}

/**
 * Releases jobs at buildings that are gone and recounts `present`, so it holds even if another
 * system moved a worker without telling anyone.
 */
export function auditJobs(state: WorldState): void {
  for (const r of state.residents) {
    if (!r.jobId) continue;
    const b = findById(state.buildings, r.jobId);
    if (!b) release(state, r, true);
    // Pausing a building lets its workers go (a Ledger lever for labor), once their task is done.
    else if (b.rt?.paused && r.activity.kind !== 'task' && !r.carry) release(state, r);
  }
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    let present = 0;
    for (let i = rt.workers.length - 1; i >= 0; i--) {
      const r = findById(state.residents, rt.workers[i]!);
      if (!r || r.jobId !== b.id) {
        rt.workers.splice(i, 1);
        continue;
      }
      if (r.inside === b.id) present++;
    }
    rt.present = present;
  }
}
