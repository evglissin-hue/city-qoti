// Calendar arithmetic for the Ledger systems. Tick 0 is 06:00 on day 1 (START_HOUR), so the
// time of day is shifted before taking the remainder.
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, WORK_HOURS } from '../../constants';

/** Ticks since the last midnight. */
export function tickOfDay(tick: number): number {
  return (tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
}

/** Absolute day index (day 0 is Spring day 1 of year 1). */
export function dayIndex(tick: number): number {
  return Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

export function hourOf(tick: number): number {
  return Math.floor(tickOfDay(tick) / TICKS_PER_HOUR);
}

/** Inside the work day (08:00 to 17:00): porters and builders take new tasks only then. */
export function isWorkTime(tick: number): boolean {
  const h = hourOf(tick);
  return h >= WORK_HOURS[0] && h < WORK_HOURS[1];
}
