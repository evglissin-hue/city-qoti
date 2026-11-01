// The seasons system (C5A; docs/spec/14-challenge.md, Seasons). Hourly at minute 2, it acts twice a
// day at most:
//   00:02  the season turns over on day 1: the season card (season.started), the winter counters
//          open on Winter day 1 and close (Warm Hearths) on Spring day 1; the river freezes on
//          Winter day RIVER_FREEZE_DAY and thaws on Spring day 1.
//   23:02  each night fish, bread and milk spoil (spoilage.ts); on the season's last day, after
//          the festival (18:00 to 22:00), the season report.
// Sowing, ripening and the harvest read the season table themselves (systems/production/fields).
// It returns at once in sandbox valleys.
import { DAYS_PER_SEASON, MAP_SIZE, RIVER_FREEZE_DAY, TICKS_PER_HOUR } from '../../constants';
import type { System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { emptyWarmth } from '../../state/seasons';
import { seasonCardView, weatherView } from '../../view/seasons';
import { seasonReportView } from '../../view/season';
import { chronicle } from '../chronicle/api';
import { markChunks } from '../hearth/charm/dirty';
import { SKATING_COMFORT } from '../hearth/charm/sources';
import { endWinter } from '../warmth';
import { dayIndex, hourOf } from '../economy/time';
import { seasonNow } from './api';
import { skatingSpots } from './place';
import { spoil } from './spoilage';
import { townFocus } from './place';

export const SEASONS_OFFSET = 2;
/** The hour the season report goes out on the last day, after the festival. */
export const REPORT_HOUR = 23;

export const seasons: System = {
  id: 'seasons',
  order: 12,
  every: TICKS_PER_HOUR,
  offset: SEASONS_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const hour = hourOf(state.tick);
    if (hour === 0) turnDay(state, ctx);
    else if (hour === REPORT_HOUR) {
      spoil(state);
      if (seasonNow(state).day === DAYS_PER_SEASON) report(state, ctx);
    }
  },
};

function report(state: WorldState, ctx: TickCtx): void {
  ctx.events.push({ e: 'season.report', r: seasonReportView(state) });
}

/** 00:02: what the new day brings the season and the river. */
export function turnDay(state: WorldState, ctx: TickCtx): void {
  const { season, year, day } = seasonNow(state);
  if (day === 1) startSeason(state, ctx, season, year);
  if (season === 3 && day === RIVER_FREEZE_DAY && !state.weather.river.frozen) freeze(state, ctx);
  // A valley that missed the freeze day (loaded late in winter) still freezes.
  if (season === 3 && day > RIVER_FREEZE_DAY && !state.weather.river.frozen) freeze(state, ctx);
}

function startSeason(state: WorldState, ctx: TickCtx, season: number, year: number): void {
  if (season === 0) {
    closeWinter(state);
    if (state.weather.river.frozen) thaw(state, ctx);
  }
  if (season === 3) openWinter(state, ctx, year);
  ctx.events.push({ e: 'season.started', c: seasonCardView(state) });
}

/** Winter day 1: the warmth counters start afresh; the very first winter gets a Chronicle page. */
function openWinter(state: WorldState, ctx: TickCtx, year: number): void {
  state.warmth = { ...emptyWarmth(), winter: year };
  if (year === 0 && dayIndex(state.tick) > 0) {
    chronicle(state, ctx, 'first-winter', { text: [], snapshot: { focus: townFocus(state), radius: 14 } });
  }
}

/** Spring day 1: a winter where nobody was cold counts toward Warm Hearths; warmth goes away. */
export function closeWinter(state: WorldState): void {
  const w = state.warmth;
  if (
    w.winter >= 0 &&
    w.coldHouseholdDays === 0 &&
    w.coldHouseholds.length === 0 &&
    state.households.length > 0
  ) {
    state.seasons.warmWinters += 1;
  }
  endWinter(state);
}

export function freeze(state: WorldState, ctx: TickCtx): void {
  state.weather.river = { frozen: true, frozenTick: state.tick };
  markSkatingCharm(state);
  ctx.events.push({ e: 'weather.updated', w: weatherView(state) });
}

export function thaw(state: WorldState, ctx: TickCtx): void {
  // The spots are cached per freeze, so mark them before the river opens.
  markSkatingCharm(state);
  state.weather.river = { frozen: false, frozenTick: -1 };
  ctx.events.push({ e: 'weather.updated', w: weatherView(state) });
}

/** The skating spots' little comfort comes and goes with the ice: recompute the chunks by them. */
function markSkatingCharm(state: WorldState): void {
  const r = SKATING_COMFORT.radius;
  for (const t of skatingSpots(state)) {
    const x = t % MAP_SIZE;
    const z = (t - x) / MAP_SIZE;
    markChunks(state, [x - r, z - r, x + r, z + r]);
  }
}
