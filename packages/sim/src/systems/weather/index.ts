// The weather system (C5A; docs/spec/14-challenge.md, Weather and events). Daily at 00:04:
//   1. Today's weather comes off the front of the forecast (or is rolled), and the forecast is
//      filled to one day ahead, two with the Barometer, from the season's odds on the 'weather'
//      stream (content WeatherDef.odds).
//   2. On day 1 of a season, each of its events (content SeasonDef.events) may be scheduled: its
//      chance is EventDef.odds times the economy dial's frequency (gentle x0.7, standard x1,
//      thoughtful x1.3), never the same event two seasons of its kind in a row, the circus only at
//      Village rank and only where there is a Village Green. Each is forecast 1 to 2 days ahead
//      (event.forecast, an alert and a letter's worth of blurb).
//   3. Events start and end on their days: a flood soaks the floodplain (buildings lose condition
//      and some stored goods, capped), an early frost halves the wheat still standing, a cold snap
//      doubles the firewood (systems/warmth reads it), a drought slows the fields far from a well
//      (the yield hook), the circus brings an evening of visitors, a little mood and some coins.
//   4. A storm wears a few roofs; builders mend them as usual.
// The latest of each event is kept in `weather.events` after it ends (for "never twice in a row"
// and the season report); the views show only those still to come or running.
import { content, type EventDef } from '@qoti/content';
import {
  DAYS_PER_SEASON,
  MAP_SIZE,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  WEATHER_FORECAST_DAYS,
} from '../../constants';
import type {
  Rng,
  System,
  TickCtx,
  WeatherDay,
  WeatherEvent,
  WeatherKind,
  WorldState,
} from '../../contracts';
import { Flags } from '../../map/layers';
import { isStandard } from '../../state/hamlet';
import { seasonAt } from '../../state/seasons';
import { hasInnovation, rankAtLeast } from '../../state/village';
import { weatherEventView, weatherView } from '../../view/seasons';
import { chronicle } from '../chronicle/api';
import { book } from '../economy/api';
import { dailyOffset, dayIndex } from '../economy/time';
import { frostFields } from '../production/fields';
import { addMoodModifier } from '../residents/api';
import { placeName } from '../chronicle/text';
import { footprintSize } from '../../rules/footprint';

const WEATHER_EXTRA = 4;
export const WEATHER_OFFSET = dailyOffset(0, WEATHER_EXTRA);
/** Condition a storm takes off a roof it catches, and the share of buildings it catches (1 in n). */
export const STORM_DAMAGE = 10;
export const STORM_ONE_IN = 8;
/** Flood: share of each stored good lost (permille) and the most of one good one building loses. */
export const FLOOD_GOODS_LOSS = 200;
export const FLOOD_GOODS_CAP = 20;
/** The circus: the mood it leaves and for how long; coins each resident's visit brings, pennies. */
export const CIRCUS_MOOD = 8;
export const CIRCUS_MOOD_TICKS = 2 * TICKS_PER_DAY;
export const CIRCUS_PENNIES_PER_RESIDENT = 20;

/** Event frequency by the economy dial, permille (14-challenge.md, Difficulty dials). */
export const EVENT_DIAL: Readonly<Record<string, number>> = { gentle: 700, standard: 1000, thoughtful: 1300 };

export const weather: System = {
  id: 'weather',
  order: 14,
  every: TICKS_PER_DAY,
  offset: WEATHER_OFFSET,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    weatherDay(state, ctx);
  },
};

/** Days the forecast reaches: one, two with the Barometer. */
export function forecastDays(state: WorldState): number {
  return hasInnovation(state, 'barometer') ? WEATHER_FORECAST_DAYS : 1;
}

/** Season index of an absolute day. */
function seasonOfDay(day: number): number {
  return Math.floor(day / DAYS_PER_SEASON) % 4;
}

/** Rolls a day's weather from its season's odds. */
export function rollWeather(rng: Rng, season: number): WeatherKind {
  let total = 0;
  for (const w of content.weather) total += w.odds.find(([s]) => s === season)?.[1] ?? 0;
  if (total <= 0) return 'clear';
  let r = rng.int(total);
  for (const w of content.weather) {
    const p = w.odds.find(([s]) => s === season)?.[1] ?? 0;
    if (r < p) return w.id;
    r -= p;
  }
  return 'clear';
}

/** 00:04: the day's weather, the forecast, and the events. */
export function weatherDay(state: WorldState, ctx: TickCtx): void {
  const rng = ctx.rng('weather');
  const today = dayIndex(state.tick);
  const w = state.weather;
  // Today: the front of the forecast when it was for today, else a fresh roll.
  const ahead = w.forecast.filter((d) => d.day > today);
  const known = w.forecast.find((d) => d.day === today);
  w.today = known ? known.kind : rollWeather(rng, seasonOfDay(today));
  const forecast: WeatherDay[] = ahead.slice(0, forecastDays(state));
  for (let d = today + 1 + forecast.length; forecast.length < forecastDays(state); d++) {
    forecast.push({ day: d, kind: rollWeather(rng, seasonOfDay(d)) });
  }
  w.forecast = forecast;
  const { day } = seasonAt(state.tick);
  if (day === 1) scheduleEvents(state, rng);
  runEvents(state, ctx, today);
  if (w.today === 'storm') storm(state, ctx, rng);
  ctx.events.push({ e: 'weather.updated', w: weatherView(state) });
}

/** The tick an absolute day's weather pass runs (its 00:04). */
export function dayTick(day: number): number {
  return day * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR + WEATHER_EXTRA;
}

/** The last of this event before now, if any. */
function lastOf(state: WorldState, id: string): WeatherEvent | undefined {
  let last: WeatherEvent | undefined;
  for (const v of state.weather.events) if (v.event === id && (!last || v.start > last.start)) last = v;
  return last;
}

/** Why an event cannot come this season, or null when it may. */
export function eventBlocked(state: WorldState, def: EventDef): string | null {
  if (def.rank && !rankAtLeast(state, def.rank)) return 'rank';
  const last = lastOf(state, def.id);
  // Never twice in a row: not if it came the last time its season came round.
  if (last && dayIndex(state.tick) - dayIndex(last.start) < 4 * DAYS_PER_SEASON + DAYS_PER_SEASON)
    return 'again';
  if (def.id === 'circus' && !state.hearth.sites.some((s) => s.pattern === 'village-green'))
    return 'no-green';
  return null;
}

/** The dial's chance of an event this season, permille. */
export function eventChance(state: WorldState, def: EventDef): number {
  return Math.min(1000, Math.round((def.odds * (EVENT_DIAL[state.settings.economy] ?? 1000)) / 1000));
}

function scheduleEvents(state: WorldState, rng: Rng): void {
  const { season } = seasonAt(state.tick);
  const today = dayIndex(state.tick);
  const ids = content.seasons[season]?.events ?? [];
  for (const id of ids) {
    const def = content.eventById.get(id);
    if (!def) continue;
    // Always roll, so one event's luck never shifts another's.
    const roll = rng.int(1000);
    const lead = rng.range(def.forecastDays[0], def.forecastDays[1]);
    const length = rng.range(def.durationDays[0], def.durationDays[1]);
    if (eventBlocked(state, def) || roll >= eventChance(state, def)) continue;
    // Early frost comes on Autumn days 1 to 3 (before the harvest is in); others mid-season.
    const first = id === 'early-frost' ? 1 : 2;
    const last = id === 'early-frost' ? 3 : DAYS_PER_SEASON - length + 1;
    const startDay = today + rng.range(Math.max(first, 1 + lead) - 1, Math.max(first, last) - 1);
    const v: WeatherEvent = {
      id: state.nextId++,
      event: id,
      start: dayTick(startDay),
      end: dayTick(startDay + length),
      forecastTick: dayTick(Math.max(today, startDay - lead)),
    };
    state.weather.events.push(v);
    state.weather.events.sort((a, b) => a.start - b.start || a.id - b.id);
  }
  // Keep only the latest ended event of each kind (and everything still to come).
  const keep: WeatherEvent[] = [];
  for (const v of state.weather.events) {
    if (v.end > state.tick || lastOf(state, v.event) === v) keep.push(v);
  }
  state.weather.events = keep;
}

function runEvents(state: WorldState, ctx: TickCtx, today: number): void {
  for (const v of state.weather.events) {
    const def = content.eventById.get(v.event);
    if (!def) continue;
    if (dayIndex(v.forecastTick) === today && v.forecastTick <= state.tick) {
      ctx.events.push({ e: 'event.forecast', v: weatherEventView(state, v) });
      ctx.events.push({ e: 'notify', kind: 'event', text: def.blurb });
    }
    if (dayIndex(v.start) === today) startEvent(state, ctx, v);
    if (dayIndex(v.end) === today) ctx.events.push({ e: 'event.ended', v: weatherEventView(state, v) });
  }
}

function startEvent(state: WorldState, ctx: TickCtx, v: WeatherEvent): void {
  ctx.events.push({ e: 'event.started', v: weatherEventView(state, v) });
  switch (v.event) {
    case 'flood':
      flood(state, ctx, v);
      return;
    case 'early-frost':
      frostFields(state, ctx);
      chronicle(state, ctx, 'first-frost', { text: [] });
      return;
    case 'cold-snap':
      chronicle(state, ctx, 'cold-snap', { text: [] });
      return;
    case 'circus':
      circus(state, ctx);
      return;
  }
}

/** True when any tile of the building's footprint is floodplain. */
export function onFloodplain(state: WorldState, x: number, z: number, w: number, d: number): boolean {
  for (let tz = z; tz < z + d; tz++) {
    for (let tx = x; tx < x + w; tx++)
      if (state.map.flags[tz * MAP_SIZE + tx]! & Flags.floodplain) return true;
  }
  return false;
}

/** The flood: buildings on the floodplain stand in water until it ends, lose condition and goods. */
export function flood(state: WorldState, ctx: TickCtx, v: WeatherEvent): void {
  const keep = content.eventById.get('flood')?.effects.find(([n]) => n === 'condition')?.[1] ?? 800;
  let focus = -1;
  for (const b of state.buildings) {
    const rt = b.rt;
    const def = content.buildingById.get(b.def);
    if (!rt || !def) continue;
    const [w, d] = footprintSize(def, b.rot);
    if (!onFloodplain(state, b.x, b.z, w, d)) continue;
    rt.flooded = v.end;
    rt.condition = Math.floor((rt.condition * keep) / 1000);
    for (const store of [rt.store, rt.output]) {
      for (let g = 0; g < store.length; g++) {
        const n = store[g]!;
        if (n <= 0) continue;
        store[g] = n - Math.min(FLOOD_GOODS_CAP, Math.floor((n * FLOOD_GOODS_LOSS) / 1000));
      }
    }
    if (focus < 0) focus = b.z * MAP_SIZE + b.x;
  }
  const tile = focus >= 0 ? focus : (MAP_SIZE >> 1) * MAP_SIZE + (MAP_SIZE >> 1);
  const at: [number, number] = [tile % MAP_SIZE, Math.floor(tile / MAP_SIZE)];
  chronicle(state, ctx, 'flood', {
    text: [['place', placeName(state, ctx, tile)]],
    snapshot: { focus: at, radius: 10 },
  });
}

/** The circus: an evening on the Village Green, a little joy for everyone, and visitors' coins. */
function circus(state: WorldState, ctx: TickCtx): void {
  const site = state.hearth.sites.find((s) => s.pattern === 'village-green');
  if (!site) return;
  for (const r of state.residents) {
    addMoodModifier(state, r.id, { kind: 'circus', value: CIRCUS_MOOD, ticks: CIRCUS_MOOD_TICKS });
  }
  book(state, 'visitors', CIRCUS_PENNIES_PER_RESIDENT * state.residents.length);
  const at: [number, number] = [site.anchor % MAP_SIZE, Math.floor(site.anchor / MAP_SIZE)];
  chronicle(state, ctx, 'circus', {
    text: [['place', placeName(state, ctx, site.anchor)]],
    snapshot: { focus: at, radius: 8 },
  });
}

/** A storm catches one roof in STORM_ONE_IN. */
function storm(state: WorldState, _ctx: TickCtx, rng: Rng): void {
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt) continue;
    if (rng.int(STORM_ONE_IN) !== 0) continue;
    b.rt.condition = Math.max(0, b.rt.condition - STORM_DAMAGE);
  }
}
