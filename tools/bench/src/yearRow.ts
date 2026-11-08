// The tune's year view (C5.0): one line per in-game day with the season, the weather (a star when
// the river is frozen), how many households were cold, the last festival's stars, the telegraphed
// raid's band and how the last raid went. It reads the I3 slices C5.0 added, which C5A to C5D fill;
// until a slice has something to say its column prints '-'. Nothing here changes the valley.
import { calendar, SEASON_NAMES, type WorldState } from '@qoti/sim';

const DASH = '-';

function weather(s: WorldState): string {
  return s.weather.river.frozen ? `${s.weather.today}*` : s.weather.today;
}

/** Households cold today, or '-' while no household carries warmth (outside winter, before C5A). */
function cold(s: WorldState): string {
  let seen = false;
  let n = 0;
  for (const h of s.households) {
    if (!h.warmth) continue;
    seen = true;
    if (h.warmth.coldHours > 0) n++;
  }
  return seen ? String(n) : DASH;
}

function stars(s: WorldState): string {
  const f = s.festival;
  const v = f.outcome?.stars ?? f.history[f.history.length - 1]?.stars;
  return v === undefined ? DASH : String(v);
}

function band(s: WorldState): string {
  return s.threats.scheduled?.band ?? DASH;
}

/** 'live:n' while raiders are on the map, else the last raid's result. */
function raid(s: WorldState): string {
  if (s.raid) return `live:${s.raid.raiders.length}`;
  const last = s.threats.history[s.threats.history.length - 1];
  if (!last) return DASH;
  return last.repelled ? (last.stolen === 0 ? 'held' : 'repelled') : `lost ${last.stolen}`;
}

/** Column heads for `yearRow`. */
export const YEAR_HEAD = 'day  yr season    weather  cold stars threat     raid';

/** One day of the year view (call at the day's end). */
export function yearRow(state: WorldState, day: number): string {
  const c = calendar(state.tick);
  return [
    String(day).padStart(3),
    String(c.year).padStart(3),
    `${SEASON_NAMES[c.season]} ${c.day}`.padEnd(9),
    weather(state).padEnd(8),
    cold(state).padStart(4),
    stars(state).padStart(5),
    band(state).padEnd(10),
    raid(state),
  ].join(' ');
}
