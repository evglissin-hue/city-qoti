// The supplies' clock: absolute ticks of an hour on a day index (the clock's day starts at START_HOUR).
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';

/** The absolute tick of `hour`:00 (plus `minute`) on day index `day`. */
export function tickAt(day: number, hour: number, minute = 0): number {
  return (
    day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR + Math.round((minute * TICKS_PER_HOUR) / 60)
  );
}
