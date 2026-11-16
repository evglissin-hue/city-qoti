// Taking porters and builders from their workplace and handing them back
// (docs/build/i1-wave-notes.md, Who drives a resident). While a resident's activity is a `task`,
// the Ledger systems move them with requestMove and check arrival with isAt; the schedule leaves
// them alone. Arrival is never assumed in the same tick, so real walking works unchanged.
//
// Activity.taskId encodes what the task is, so no extra state is saved:
//   > 0  a porter job (logistics.jobs id)
//   = 0  walking back to the workplace door after a task
//   < 0  a builder working at building -taskId (a construction site, or a repair)
import { MOOD_PRODUCTIVITY, ResidentFlags } from '../../constants';
import type { Building, Resident, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { moodBand } from '../../view/hamlet';
import {
  doorTile,
  enterBuilding,
  isAt,
  isWalking,
  requestMove,
  setInside,
  type MoveResult,
} from '../movement/api';
import { pathBetween, pathFor } from '../movement/paths';
import { crossesClosed, eveningClosed } from '../traffic/evening';

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

/** A walk result with R2B's fourth answer: 'waiting' (no barrow way while evening streets are closed). */
export type TaskMove = MoveResult | 'waiting';

/**
 * A task walk. Outside 17:00 to 21:00 this is requestMove. While evening streets are closed the
 * barrow plans with `pathFor(..., 'barrow')`, mirroring moveResident (leave the building, keep the
 * mid-step continuation). With no barrow path but an ordinary one, the porter waits where they are,
 * task kept, and the next think tries again; the storehouse says so (logistics/evening.ts).
 */
function taskMove(state: WorldState, r: Resident, tile: number): TaskMove {
  if (!eveningClosed(state)) return requestMove(state, r.id, tile, 'task');
  const m = r.move;
  if (m && m.target === tile && !crossesClosed(state, m.path, m.step)) {
    m.reason = 'task';
    setInside(state, r, 0);
    return 'walking';
  }
  // Mid-step: finish the step under way and plan onward from the next tile.
  const midStep = !!m && m.progress > 0 && m.step < m.path.length;
  const from = midStep ? m.path[m.step]! : r.tile;
  const onward = from === tile ? [] : pathFor(state, from, tile, 'barrow');
  if (!onward) {
    if (!pathBetween(state, r.tile, tile)) {
      setInside(state, r, 0);
      r.move = null;
      return 'unreachable';
    }
    // No way for a barrow now: wait where they stand (a step in progress is finished first).
    r.move = midStep ? { ...m, path: [from], step: 0, target: from, reason: 'task' } : null;
    return 'waiting';
  }
  setInside(state, r, 0);
  if (!midStep && r.tile === tile) {
    r.move = null;
    return 'arrived';
  }
  r.move = {
    path: midStep ? [from, ...onward] : onward,
    step: 0,
    progress: midStep ? m.progress : 0,
    target: tile,
    reason: 'task',
    version: state.networkVersion,
  };
  r.flags &= ~ResidentFlags.stuck;
  return 'walking';
}

/** Starts a task and the walk to `tile`. */
export function startTask(state: WorldState, r: Resident, taskId: number, tile: number): TaskMove {
  r.activity = { kind: 'task', taskId };
  return taskMove(state, r, tile);
}

/**
 * Keeps a tasked resident heading for `tile`: true once they stand there. Retries the walk when
 * they stopped elsewhere; returns null when the tile cannot be reached, including a walk that
 * ended early with the resident flagged stuck (the movement system's way of giving up). While an
 * evening street is closed (R2B) a walk that would cross it is planned again for the barrow, and a
 * porter with no barrow way stands and waits (false) until the street opens.
 */
export function walkTo(state: WorldState, r: Resident, tile: number): boolean | null {
  if (isAt(state, r.id, tile)) return true;
  if (isWalking(state, r.id)) {
    const m = r.move!;
    if (m.progress === 0 && crossesClosed(state, m.path, m.step)) {
      const res = taskMove(state, r, tile);
      return res === 'unreachable' ? null : res === 'arrived';
    }
    return false;
  }
  if (r.flags & ResidentFlags.stuck) return null;
  const res = taskMove(state, r, tile);
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
  if (res !== 'walking' && res !== 'waiting') release(state, r);
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
