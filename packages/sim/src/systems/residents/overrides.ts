// The schedule hook (C5.0): one registry of overrides read before the day table, so no I3 track
// edits the schedule. Each override names a priority and returns what a resident should be doing
// this hour (an Activity) or null to leave them to the day table; the highest priority that has
// something wins. C5B: the festival evening; C5D: the bell (indoors), Watch duty and turn-out;
// C5A: skating and staying in during storms. The bell beats the festival.
import type { Activity, Resident, WorldState } from '../../contracts';

export interface ScheduleOverride {
  id: string;
  /** Higher wins. Proposed: bell 100, Watch turn-out 90, storm 80, festival 50, Watch duty 40, skating 20. */
  priority: number;
  /** Activity kinds acted on: home and sleep go home, work goes in at `at`, leisure walks to `tile`. */
  pick: (state: WorldState, r: Resident, hour: number) => Activity | null;
}

// Registry: one line per override, alphabetical by id.
// prettier-ignore
export const scheduleOverrides: readonly ScheduleOverride[] = [
];

let extra: readonly ScheduleOverride[] = [];

/** Tests only: runs `fn` with extra overrides registered beside the real ones. */
export function withScheduleOverrides<T>(list: readonly ScheduleOverride[], fn: () => T): T {
  const before = extra;
  extra = [...before, ...list];
  try {
    return fn();
  } finally {
    extra = before;
  }
}

/** What the highest-priority override wants of `r` this hour, or null for the day table. */
export function scheduleOverride(state: WorldState, r: Resident, hour: number): Activity | null {
  if (scheduleOverrides.length === 0 && extra.length === 0) return null;
  let best: Activity | null = null;
  let bestPriority = -Infinity;
  for (const list of [scheduleOverrides, extra]) {
    for (const o of list) {
      if (o.priority <= bestPriority) continue;
      const a = o.pick(state, r, hour);
      if (a) {
        best = a;
        bestPriority = o.priority;
      }
    }
  }
  return best;
}
