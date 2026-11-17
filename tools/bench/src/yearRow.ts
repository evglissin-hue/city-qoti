// The tune's year view (C5.0): one line per in-game day with the season, the weather (a star when
// the river is frozen), how many households were cold, the last festival's stars, the telegraphed
// raid's band and how the last raid went. It reads the I3 slices C5.0 added, which C5A to C5D fill;
// until a slice has something to say its column prints '-'. Nothing here changes the valley.
import { balancesView, calendar, SEASON_NAMES, type WorldState } from '@qoti/sim';

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

/** The season plan's winter marks for Food and Fuel while they stand, else '-'. */
function marks(s: WorldState): string {
  const [food, fuel] = balancesView(s).lines;
  if (food?.mark == null && fuel?.mark == null) return DASH;
  return `${food?.mark ?? DASH}/${fuel?.mark ?? DASH}`;
}

/** The last tallied evening, or null while none has been (the tally keeps day -1 until the first 17:00). */
function evening(s: WorldState) {
  const t = s.evenings.tonight;
  return t.day >= 0 && t.grownups > 0 ? t : null;
}

/** Percent of grown-ups out on the last evening, or '-'. */
function shareOut(s: WorldState): string {
  const t = evening(s);
  return t ? String(Math.round((t.out / t.grownups) * 100)) : DASH;
}

/** The last evening's average score, or '-'. */
function avgEvening(s: WorldState): string {
  const t = evening(s);
  return t ? String(Math.round(t.scoreSum / t.grownups)) : DASH;
}

/** Percent of that evening's Treats sold on the round, or '-' when none were sold. */
function treatsRound(s: WorldState): string {
  const t = evening(s);
  const all = t ? t.treatsAtStops + t.treatsPassing + t.treatsDoorstep : 0;
  return t && all > 0 ? String(Math.round(((t.treatsAtStops + t.treatsPassing) / all) * 100)) : DASH;
}

/** Open gaps, or '-' while the town has never had one (opened or closed). */
function openGaps(s: WorldState): string {
  const g = s.gaps;
  return g.open.length || g.closed.length || g.closedCount ? String(g.open.length) : DASH;
}

/** Column heads for `yearRow`. */
export const YEAR_HEAD =
  'day  yr season    weather  cold stars threat     raid       marks  road   out% eve treats% gaps';

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
    raid(state).padEnd(10),
    marks(state).padEnd(6),
    (balancesView(state).passClosed ? 'closed' : DASH).padEnd(6),
    shareOut(state).padStart(4),
    avgEvening(state).padStart(3),
    treatsRound(state).padStart(7),
    openGaps(state).padStart(4),
  ].join(' ');
}
