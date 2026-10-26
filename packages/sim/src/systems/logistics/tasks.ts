// Taking porters and builders from their workplace and handing them back
// (docs/build/i1-wave-notes.md, Who drives a resident). While a resident's activity is a `task`,
// the Ledger systems move them with requestMove and check arrival with isAt; the schedule leaves
// them alone. Arrival is never assumed in the same tick, so real walking works unchanged.
//
// Activity.taskId encodes what the task is, so no extra state is saved:
//   > 0  a porter job (logistics.jobs id)
//   = 0  walking back to the workplace door after a task
//   < 0  a builder working at building -taskId (a construction site, or a repair)
import { MOOD_PRODUCTIVITY } from '../../constants';
import type { Building, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { moodBand } from '../../view/hamlet';
import { doorTile, enterBuilding, isAt, isWalking, requestMove, type MoveResult } from '../movement/api';

export const TASK_RETURNING = 0;

export function onTask(r: Resident): boolean {
  return r.activity.kind === 'task';
}

export function taskIdOf(r: Resident): number | null {
  return r.activity.kind === 'task' ? r.activity.taskId : null;
}

/** Productivity percent from the resident's mood band (MOOD_PRODUCTIVITY). */
export function productivity(r: Resident): number {
  return MOOD_PRODUCTIVITY[moodBand(r.mood)]!;
}

/**
 * True when the resident works at `workplace` and is free to take a task now: present (inside or
 * standing at the door, not walking), or already walking back from a previous task.
 */
export function available(r: Resident, workplace: Building): boolean {
  if (r.jobId !== workplace.id) return false;
  if (r.activity.kind === 'task') return r.activity.taskId === TASK_RETURNING;
  if (r.move) return false;
  return r.inside === workplace.id || (r.inside === 0 && r.tile === doorTile(workplace));
}

/** Starts a task and the walk to `tile`. */
export function startTask(state: WorldState, r: Resident, taskId: number, tile: number): MoveResult {
  r.activity = { kind: 'task', taskId };
  return requestMove(state, r.id, tile, 'task');
}

/**
 * Keeps a tasked resident heading for `tile`: true once they stand there. Retries the walk when
 * they stopped elsewhere; returns null when the tile cannot be reached.
 */
export function walkTo(state: WorldState, r: Resident, tile: number): boolean | null {
  if (isAt(state, r.id, tile)) return true;
  if (isWalking(state, r.id)) return false;
  const res = requestMove(state, r.id, tile, 'task');
  return res === 'unreachable' ? null : res === 'arrived';
}

/** Ends a task: back to work inside the workplace when standing at its door, else where they are. */
export function release(state: WorldState, r: Resident): void {
  r.carry = null;
  const work = r.jobId ? findById(state.buildings, r.jobId) : undefined;
  if (!work) {
    r.activity = { kind: 'goHome' };
    return;
  }
  r.activity = { kind: 'work', at: work.id };
  if (isAt(state, r.id, doorTile(work))) enterBuilding(state, r.id, work.id);
}

/**
 * After a task: walk back to the workplace, or hand the resident back to the schedule at once
 * outside work hours (they head home from wherever they are).
 */
export function finishTask(state: WorldState, r: Resident, workTime: boolean): void {
  r.carry = null;
  const work = r.jobId ? findById(state.buildings, r.jobId) : undefined;
  if (!work || !workTime) {
    release(state, r);
    return;
  }
  const res = startTask(state, r, TASK_RETURNING, doorTile(work));
  if (res !== 'walking') release(state, r);
}

/** Moves residents walking back from a task along; releases them at the door. */
export function tickReturning(state: WorldState, workTime: boolean): void {
  for (const r of state.residents) {
    if (r.activity.kind !== 'task' || r.activity.taskId !== TASK_RETURNING) continue;
    const work = r.jobId ? findById(state.buildings, r.jobId) : undefined;
    if (!work || !workTime) {
      release(state, r);
      continue;
    }
    const at = walkTo(state, r, doorTile(work));
    if (at !== false) release(state, r);
  }
}
