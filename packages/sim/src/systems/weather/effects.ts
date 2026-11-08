// What today's weather and the running events do (C5A; docs/spec/14-challenge.md, Weather and
// events). The named effects live in content (WeatherDef.effects, EventDef.effects, permille); the
// systems read them here, through the three hooks:
//   yield     rain farms +10%, drought farms -40% unless a well is near
//   walk      snow: every tile takes 30% longer, for residents, carts and raiders alike
//   schedule  storm: everybody stays in after work; rain: half the evening outings stay in
// Heat takes a fifth off every well's capacity (residents/needs reads wellPermille). Storm damage to
// roofs and the flood are applied by the weather system itself (weather/index.ts).
import { content, type BuildingDef, type ProductionMethod } from '@qoti/content';
import type { Activity, Building, Resident, WorldState } from '../../contracts';
import { dayIndex } from '../economy/time';

/** Today's weather effect `name`, permille (1000 when it has none). */
export function weatherEffect(state: WorldState, name: string): number {
  const def = content.weatherById.get(state.weather.today);
  return def?.effects.find(([n]) => n === name)?.[1] ?? 1000;
}

/** The running event with this content id, if any. */
export function runningEvent(state: WorldState, id: string): boolean {
  for (const v of state.weather.events)
    if (v.event === id && state.tick >= v.start && state.tick < v.end) return true;
  return false;
}

/** A running event's effect `name`, permille (1000 when the event is not on). */
export function eventEffect(state: WorldState, id: string, name: string): number {
  if (!runningEvent(state, id)) return 1000;
  return content.eventById.get(id)?.effects.find(([n]) => n === name)?.[1] ?? 1000;
}

/** Tiles from a well within which a farm shrugs off a drought. */
export const DROUGHT_WELL_REACH = 8;

function nearWell(state: WorldState, b: Building): boolean {
  const r2 = DROUGHT_WELL_REACH * DROUGHT_WELL_REACH;
  for (const w of state.buildings) {
    if (w.stage !== 'built') continue;
    if (!content.buildingById.get(w.def)?.coverage?.some((c) => c.kind === 'water')) continue;
    const dx = w.x - b.x;
    const dz = w.z - b.z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

/** Yield hook: rain on the fields, and the drought on farms far from a well. */
export function farmWeather(
  state: WorldState,
  b: Building,
  _def: BuildingDef,
  method: ProductionMethod,
): number {
  if (method.kind !== 'farm') return 1000;
  let p = weatherEffect(state, 'farm');
  const drought = eventEffect(state, 'drought', 'farm');
  if (drought !== 1000 && !nearWell(state, b)) p = Math.floor((p * drought) / 1000);
  return p;
}

/** Walk hook: snow makes every tile slower (permille of tile ticks). */
export function snowWalk(state: WorldState): number {
  return weatherEffect(state, 'walk');
}

/** Heat: share of each well's capacity, permille. */
export function wellPermille(state: WorldState): number {
  return weatherEffect(state, 'well');
}

/** The evening hours the storm and the rain keep folk in. */
export const EVENING_HOURS = [17, 22] as const;

function evening(hour: number): boolean {
  return hour >= EVENING_HOURS[0] && hour < EVENING_HOURS[1];
}

/** Schedule hook: in a storm everybody stays in for the evening. */
export function stormIndoors(state: WorldState, _r: Resident, hour: number): Activity | null {
  if (state.weather.today !== 'storm' || !evening(hour)) return null;
  return { kind: 'home' };
}

/** Schedule hook: rain halves outdoor leisure (one in two stays in, by id and day). */
export function rainIndoors(state: WorldState, r: Resident, hour: number): Activity | null {
  if (weatherEffect(state, 'leisure') >= 1000 || !evening(hour)) return null;
  const keep = weatherEffect(state, 'leisure');
  // permille of folk who still go out: 500 is one in two.
  const n = Math.max(1, Math.round(1000 / Math.max(1, 1000 - keep)));
  return (r.id + dayIndex(state.tick)) % n === 0 ? { kind: 'home' } : null;
}
