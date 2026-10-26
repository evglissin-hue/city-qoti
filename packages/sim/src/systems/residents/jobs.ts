// Jobs (docs/spec/11-residents.md and the I1 wave notes): adults and young residents take the
// nearest open job (any role: worker, builder, porter, vendor), are released when the building
// goes, and `present` always equals the workers inside their workplace.
import { content } from '@qoti/content';
import type { Building, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { setInside } from '../movement/api';
import { doorOf, householdOf, isWorkingAge, manhattan } from './places';
import { pushHistory } from './records';

/** Open job slots at a built building, or 0. */
export function openJobs(b: Building): number {
  if (b.stage !== 'built' || !b.rt) return 0;
  const count = content.buildingById.get(b.def)?.jobs?.count ?? 0;
  return Math.max(0, count - b.rt.workers.length);
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

/**
 * Fills open jobs: each job seeker (by id) takes the nearest open job by walking distance from
 * home (Manhattan between doors; ties by building id). Returns the number hired.
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
    let bestD = Infinity;
    for (const b of open) {
      if (openJobs(b) <= 0) continue;
      const d = manhattan(homeDoor, doorOf(state, b.id));
      if (d < bestD) {
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
 * Releases jobs at buildings that are gone and recounts `present`, so it holds even if another
 * system moved a worker without telling anyone.
 */
export function auditJobs(state: WorldState): void {
  for (const r of state.residents) {
    if (r.jobId && !findById(state.buildings, r.jobId)) release(state, r, true);
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
