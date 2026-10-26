// Jobs (docs/spec/11-residents.md and the I1 wave notes): adults and young residents take the
// open job that matters most (food first, see slotPriority), nearest first among equals; they are
// released when the building goes or is paused, and `present` always equals the workers inside
// their workplace. Each hour one worker may move from a less important job to a more important
// open one, so a new farm or fishery gets hands even when everyone is already employed.
import { content, type BuildingDef } from '@qoti/content';
import { BuildingStatus } from '../../constants';
import type { Building, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { townStock } from '../../view/hamlet';
import { setInside } from '../movement/api';
import { doorOf, householdOf, isWorkingAge, manhattan } from './places';
import { pushHistory } from './records';
import { dayIndex } from './time';

/** Open job slots at a built building, or 0 (paused buildings hire nobody). */
export function openJobs(b: Building): number {
  if (b.stage !== 'built' || !b.rt || b.rt.paused) return 0;
  const count = content.buildingById.get(b.def)?.jobs?.count ?? 0;
  return Math.max(0, count - b.rt.workers.length);
}

const FOOD = new Set(content.goods.filter((g) => g.food).map((g) => g.id));
/** Grain on its way to bread counts with food. */
const FOOD_CHAIN = new Set([...FOOD, 'wheat', 'flour']);

/**
 * What the town is short of right now, recomputed each hour before hiring: food under three days
 * of eating (stock and pantries), and building materials under what open sites still need plus a
 * small reserve. Producers of short goods hire first.
 */
export interface Shortages {
  food: boolean;
  goods: Set<string>;
}

export function shortages(state: WorldState): Shortages {
  const stock = townStock(state);
  // Food anywhere in town (shelves, producers' buffers, pantries). Porters, not farmers, fix food
  // stuck in buffers, and the first porter of each storehouse is never poached (slotPriority).
  let food = 0;
  for (let g = 0; g < content.goods.length; g++) {
    if (!content.goods[g]!.food) continue;
    food += stock[g]!;
    for (const h of state.households) food += h.pantry[g] ?? 0;
  }
  const goods = new Set<string>();
  const needs = new Array<number>(content.goods.length).fill(0);
  for (const b of state.buildings) {
    const c = b.rt?.construction;
    if (c) for (let g = 0; g < needs.length; g++) needs[g]! += c.needs[g] ?? 0;
  }
  for (const id of ['logs', 'planks', 'stone']) {
    const g = content.goodIndex.get(id)!;
    if (stock[g]! < needs[g]! + 20) goods.add(id);
  }
  return { food: food < 3 * state.residents.length, goods };
}

function makes(def: BuildingDef, short: Shortages): 'short' | 'food' | 'other' {
  for (const m of def.methods ?? []) {
    for (const [g] of m.outputs) {
      if (short.goods.has(g) || (short.food && FOOD_CHAIN.has(g))) return 'short';
    }
    if (m.kind === 'farm' && short.food) return 'short';
  }
  return (def.methods ?? []).some((m) => m.kind === 'farm' || m.outputs.some(([g]) => FOOD_CHAIN.has(g)))
    ? 'food'
    : 'other';
}

/**
 * How much the k-th job at a building matters, lower first: 0 the first builder, the first porter
 * of each storehouse and anything making what the town is short of (food, or timber and stone the
 * sites are waiting on); 1 the second builder, the second porter and stall vendors; 2 food when
 * there is enough; 3 everything else that makes things; 4 the remaining builders and porters.
 * Without a porter nothing moves and without a builder nothing gets built, so those two are never
 * poached; past them a hamlet of eight keeps fed and keeps building before it hauls.
 */
export function slotPriority(def: BuildingDef, k: number, short: Shortages = NO_SHORTAGES): number {
  const role = def.jobs?.role ?? 'worker';
  if (role === 'builder') return k === 0 ? 0 : k === 1 ? 1 : 4;
  if (role === 'porter') return k === 0 ? 0 : k === 1 ? 1 : 4;
  if (role === 'vendor') return 1;
  const kind = makes(def, short);
  return kind === 'short' ? 0 : kind === 'food' ? 2 : 3;
}

const NO_SHORTAGES: Shortages = { food: false, goods: new Set() };

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

/** A building that cannot work as things stand (nothing to fell, no fields, no inputs). */
const STUCK = BuildingStatus.noTrees | BuildingStatus.noFields | BuildingStatus.missingInput;

/** Priority of a job at a building: its slot priority, or last when the building is stuck. */
function jobPriority(b: Building, def: BuildingDef, k: number, short: Shortages): number {
  return b.rt && b.rt.status & STUCK ? 5 : slotPriority(def, k, short);
}

/** Priority of a building's next open slot (Infinity when it has none). */
function openPriority(b: Building, short: Shortages): number {
  if (openJobs(b) <= 0) return Infinity;
  const def = content.buildingById.get(b.def);
  return def ? jobPriority(b, def, b.rt!.workers.length, short) : Infinity;
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
  const short = shortages(state);
  let hired = 0;
  const seekers = only ? [only] : state.residents;
  for (const r of seekers) {
    if (!jobSeeker(state, r)) continue;
    const homeDoor = doorOf(state, householdOf(state, r)!.homeId);
    let best: Building | null = null;
    let bestP = Infinity;
    let bestD = Infinity;
    for (const b of open) {
      const p = openPriority(b, short);
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
  const short = shortages(state);
  let target: Building | null = null;
  let targetP = Infinity;
  for (const b of state.buildings) {
    const p = openPriority(b, short);
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
    const p = jobPriority(b, def, rt.workers.length - 1, short);
    // Only a clear step up is worth the walk: two levels, or anything into a shortage.
    if (p <= fromP || (targetP > 0 && p < targetP + 2)) continue;
    // The newest hand at that building moves; never someone mid-task.
    for (let i = rt.workers.length - 1; i >= 0; i--) {
      const r = findById(state.residents, rt.workers[i]!);
      if (!r || r.activity.kind === 'task' || r.carry) continue;
      // Apprentices see their season out (C4D).
      if (r.apprentice && r.apprentice.untilDay > dayIndex(state.tick)) continue;
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
