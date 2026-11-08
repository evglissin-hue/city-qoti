import { DAYS_PER_SEASON, DAYS_PER_YEAR, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';

export interface CalendarDate {
  year: number;
  season: 0 | 1 | 2 | 3;
  /** 1 to 6 within the season. */
  day: number;
  hour: number;
  minute: number;
}

/** Calendar date for a tick count. Tick 0 is Year 1, Spring, day 1, 06:00. */
export function calendar(tick: number): CalendarDate {
  const total = tick + START_HOUR * TICKS_PER_HOUR;
  const dayIndex = Math.floor(total / TICKS_PER_DAY);
  const tickOfDay = total - dayIndex * TICKS_PER_DAY;
  const hour = Math.floor(tickOfDay / TICKS_PER_HOUR);
  const minute = Math.floor(((tickOfDay - hour * TICKS_PER_HOUR) * 60) / TICKS_PER_HOUR);
  const dayOfYear = dayIndex % DAYS_PER_YEAR;
  return {
    year: 1 + Math.floor(dayIndex / DAYS_PER_YEAR),
    season: Math.floor(dayOfYear / DAYS_PER_SEASON) as 0 | 1 | 2 | 3,
    day: (dayOfYear % DAYS_PER_SEASON) + 1,
    hour,
    minute,
  };
}
