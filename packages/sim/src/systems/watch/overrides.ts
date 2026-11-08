// The Watch's schedule overrides (C5D; registered in systems/residents/overrides.ts):
// - bell (100): while the bell rings everyone but the Watch on its feet goes home;
// - turn-out (90): on a raid day the Watch gathers at its guard points from 17:00 and, during the
//   raid, goes where systems/raids sends it (a tower, a raider, a guard point); shaken members go
//   home;
// - duty (40): a member on duty spends the work day at the Watch House instead of their job.
import { MAP_SIZE } from '../../constants';
import type { Activity, Resident, WorldState } from '../../contracts';
import { doorOf } from '../residents/places';
import { dayIndex } from '../economy/time';
import { guardTile, watchGoal } from '../raids/run';
import { raidDay } from '../threats/api';
import { watchHouses } from './index';

/** Hours of a duty day at the Watch House, and when the Watch gathers on a raid day. */
export const DUTY_HOURS = [8, 17] as const;
export const TURN_OUT_HOUR = 17;

function inRaidWatch(state: WorldState, r: Resident): boolean {
  const w = state.raid?.watch.find((x) => x.resident === r.id);
  return !!w && (w.state === 'guard' || w.state === 'intercept');
}

export function bellIndoors(state: WorldState, r: Resident, _hour: number): Activity | null {
  if (!state.raid?.bell || inRaidWatch(state, r)) return null;
  return { kind: 'home' };
}

export function watchTurnOut(state: WorldState, r: Resident, hour: number): Activity | null {
  if (!r.watch) return null;
  const raid = state.raid;
  if (raid) {
    const w = raid.watch.find((x) => x.resident === r.id);
    if (!w) return null;
    if (w.state === 'shaken') return { kind: 'home' };
    const goal = watchGoal(state, r.id);
    return goal === null ? null : { kind: 'leisure', tile: goal };
  }
  const s = state.threats.scheduled;
  if (!s || hour < TURN_OUT_HOUR || raidDay(s) !== dayIndex(state.tick)) return null;
  if (r.watch.shakenUntil > state.tick) return null;
  const k = state.watch.members.indexOf(r.id);
  return k < 0 ? null : { kind: 'leisure', tile: guardTile(state, k) };
}

export function watchDuty(state: WorldState, r: Resident, hour: number): Activity | null {
  if (!r.watch || state.raid || hour < DUTY_HOURS[0] || hour >= DUTY_HOURS[1]) return null;
  if (!state.watch.duty.includes(r.id) || r.watch.shakenUntil > state.tick) return null;
  const houses = watchHouses(state);
  if (houses.length === 0) return null;
  // The Watch House nearest their work (by id when level).
  let best = houses[0]!;
  const job = doorOf(state, r.jobId);
  const from = job >= 0 ? job : r.tile;
  let bestD = Infinity;
  for (const b of houses) {
    const d = Math.abs(b.x - (from % MAP_SIZE)) + Math.abs(b.z - Math.floor(from / MAP_SIZE));
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return { kind: 'work', at: best.id };
}
