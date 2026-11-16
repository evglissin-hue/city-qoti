// The evening round (docs/spec/19-evenings.md, The round): between 17:00 and 17:30 each young and
// adult resident plans one to three stops at their own minute (builders and porters at 19:00), walks
// the pleasant way, takes a seat or standing room, and comes home at 21:00. Elders and residents
// without work also make a round in the afternoon. R2A owns this file: the plan, arrivals, seats and
// the evening's tally; the walking itself is the schedule's (schedule.ts followRound).
//
// Determinism: the plan reads places (a pure function of saved state), live shelves through placeDraw,
// other residents' saved rounds, and the `round` RNG stream for the whim, one draw per candidate in id
// order. Distance is Manhattan, as chooseLeisure measures; no route is searched to choose.
import { content } from '@qoti/content';
import { MAP_SIZE, PLACE_EVENINGS, RoundFlags } from '../../constants';
import type {
  Household,
  Place,
  PlaceId,
  Resident,
  RoundStop,
  RoundStopKind,
  Rng,
  TickCtx,
  WorldState,
} from '../../contracts';
import { findById } from '../../state/entities';
import { emptyTally, startPlaceEvening } from '../../state/evenings';
import { nearestOutletWithFood } from '../economy/outlets';
import { walkGrid } from '../movement/grid';
import { fixRouteGrid } from '../movement/routes';
import { placeFeatures, placeIndex } from '../places';
import { PlaceFeature } from '../places/build';
import { placeById, placeDraw, placesNear, recordVisit } from '../places/api';
import { occupancy, occupy, STOP_TICKS, stopNow } from '../places/occupancy';
import { weatherEffect } from '../weather/effects';
import { chooseVisit, tasteFor } from './outings';
import { doorOf, householdOf, isWorkingAge } from './places';
import { needsShopping, someoneShopping } from './shopping';
import { HOUR, dayIndex, scheduleClock, tickOfDay } from './time';
import { hasTrait } from './traits';

const P = content.places;
const S_TICKS = HOUR / 60;
/** Ticks over which grown-ups plan (planMinutes after the hour). */
const PLAN_SPAN = Math.max(1, Math.round(P.planMinutes * S_TICKS));

export type RoundWindow = 'afternoon' | 'evening';

// --- The evening's start ---------------------------------------------------------------------------

/**
 * 17:00, before anyone plans: rolls `state.evenings.tonight` into its history and starts a fresh
 * tally, pushes a fresh evening onto every place's saved counts, and fixes the evening route grid.
 */
export function startEvening(state: WorldState, _ctx: TickCtx): void {
  const ev = state.evenings;
  if (ev.tonight.day >= 0) {
    ev.history.push(ev.tonight);
    while (ev.history.length > PLACE_EVENINGS) ev.history.shift();
  }
  ev.tonight = emptyTally(dayIndex(state.tick));
  ev.tonight.weather = eveningWeather(state);
  for (const row of state.places) startPlaceEvening(row);
  fixRouteGrid(state);
}

/** How the weather takes this evening: a storm keeps everyone in, rain sends half to shelter. */
export function eveningWeather(state: WorldState): 'fair' | 'rain' | 'storm' {
  if (state.weather.today === 'storm') return 'storm';
  return weatherEffect(state, 'leisure') < 1000 ? 'rain' : 'fair';
}

// --- Who plans when ---------------------------------------------------------------------------------

/** Folk set off home at this tick of day (later on a festival night). */
export function homeTick(state: WorldState): number {
  return (state.festival.live ? P.festivalHomeHour : P.homeHour) * HOUR;
}

/** A resident's own minute within the planning half hour, from their id (no RNG). */
function planOffset(r: Resident): number {
  return ((r.id * 2654435761) >>> 0) % PLAN_SPAN;
}

/** The tick of day a resident plans the window's round. */
export function planTick(r: Resident, window: RoundWindow, late: boolean): number {
  const hour = window === 'afternoon' ? P.afternoonHour : late ? P.latePlanHour : P.eveningHour;
  return hour * HOUR + planOffset(r);
}

/** The round window a resident is in now (by the world's clock), or null. */
export function roundWindow(state: WorldState, r: Resident, working: boolean): RoundWindow | null {
  if (r.stage === 'child') return null;
  const tod = tickOfDay(state.tick);
  if (tod >= P.eveningHour * HOUR && tod < homeTick(state)) return isWorkingAge(r) ? 'evening' : null;
  if (tod >= P.afternoonHour * HOUR && tod < P.eveningHour * HOUR) {
    return r.stage === 'elder' || !working ? 'afternoon' : null;
  }
  return null;
}

/**
 * Plans the evening at the resident's own minute whatever they are doing (a storm, the bell or the
 * festival may still keep them from it), so the evening's tally counts every grown-up.
 */
export function planIfDue(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  late: boolean,
): void {
  if (planned(state, r, 'evening') || tickOfDay(state.tick) < planTick(r, 'evening', late)) return;
  makePlan(state, ctx, r, h, homeDoor, 'evening');
}

/** True once the window's round is planned today. */
export function planned(state: WorldState, r: Resident, window: RoundWindow): boolean {
  if (r.roundDay !== dayIndex(state.tick) || !r.round) return false;
  return window === 'afternoon' || r.roundEvening !== undefined;
}

/** Index of the first stop of the window's round. */
export function windowStart(r: Resident, window: RoundWindow): number {
  return window === 'evening' ? (r.roundEvening ?? 0) : 0;
}

// --- The plan --------------------------------------------------------------------------------------

interface PlannedCounts {
  tick: number;
  turn: number;
  /** Residents planning each place, by the hour of day they set off for it (24 slots). */
  byPlace: Map<PlaceId, number[]>;
}

const plannedMemo = new WeakMap<WorldState, PlannedCounts>();

/** The hour of day a stop is planned for (its `at`). */
function stopHour(s: RoundStop): number {
  return Math.max(0, Math.min(23, Math.floor((s.at ?? 0) / HOUR)));
}

/** Planned visits per place and hour, from every resident's saved round today (counted once a tick). */
function plannedCounts(state: WorldState): Map<PlaceId, number[]> {
  let m = plannedMemo.get(state);
  if (!m || m.tick !== state.tick || m.turn !== state.lastTurn) {
    const day = dayIndex(state.tick);
    const byPlace = new Map<PlaceId, number[]>();
    for (const r of state.residents) {
      if (r.roundDay !== day || !r.round) continue;
      for (const s of r.round) countPlan(byPlace, s);
    }
    m = { tick: state.tick, turn: state.lastTurn, byPlace };
    plannedMemo.set(state, m);
  }
  return m.byPlace;
}

function countPlan(map: Map<PlaceId, number[]>, s: RoundStop): void {
  if (s.kind === 'shop' || s.kind === 'visit') return;
  let a = map.get(s.place);
  if (!a) {
    a = new Array<number>(24).fill(0);
    map.set(s.place, a);
  }
  a[stopHour(s)]! += 1;
}

function leisureRadius(r: Resident): number {
  if (hasTrait(r, 'curious')) return P.curiousRadius;
  if (hasTrait(r, 'homebody')) return P.homebodyRadius;
  return P.radius;
}

function manhattan(a: number, b: number): number {
  const S = MAP_SIZE;
  const ax = a % S;
  const bx = b % S;
  return Math.abs(ax - bx) + Math.abs((a - ax) / S - (b - bx) / S);
}

/** Where a resident makes for at a place: its anchor when it can be stood on, else a neighbor. */
export function approachTile(state: WorldState, place: Place): number {
  const cost = walkGrid(state).cost;
  if (cost[place.tile]! > 0) return place.tile;
  const S = MAP_SIZE;
  const x = place.tile % S;
  const z = (place.tile - x) / S;
  for (const [dx, dz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
    if (cost[nz * S + nx]! > 0) return nz * S + nx;
  }
  for (const t of place.tiles) if (cost[t]! > 0) return t;
  return -1;
}

/** Room for grown-ups: grown-up seats and standing room. */
function grownUpRoom(place: Place): number {
  return place.seats - place.childSeats + place.standing;
}

function kindOf(place: Place): RoundStopKind {
  return place.kinds[0] ?? 'sit';
}

/** True when the resident's friends (level 1+) plan the place today. */
function friendGoing(state: WorldState, r: Resident, place: PlaceId): boolean {
  const day = dayIndex(state.tick);
  for (const f of r.friends) {
    if (f.level < 1) continue;
    const o = findById(state.residents, f.id);
    if (!o || o.roundDay !== day || !o.round) continue;
    for (const s of o.round) if (s.place === place) return true;
  }
  return false;
}

interface Candidate {
  place: Place;
  tile: number;
  /** The hour of day they would set off for it. */
  hour: number;
  /** Score in hundredths. */
  score: number;
}

/**
 * A resident's liking for a place, in hundredths, before crowding: its draw, their taste for it, a
 * friend going, distance from `from`, and the whim (one draw from the stream).
 */
function liking(state: WorldState, rng: Rng, r: Resident, place: Place, from: number): number {
  let score = placeDraw(state, place) * 100;
  score += Math.max(P.tasteMin, Math.min(P.tasteMax, tasteFor(state, r, place))) * 100;
  if (friendGoing(state, r, place.id)) score += P.friendBonus * 100;
  score -= manhattan(from, place.tile) * P.distanceHundredths;
  score += (rng.int(2 * P.whim + 1) - P.whim) * 100;
  return score;
}

/** Off the score for the crowd beyond a place's room at an hour (planned visitors and this one). */
function crowding(place: Place, counts: Map<PlaceId, number[]>, hour: number): number {
  const planned = counts.get(place.id)?.[hour] ?? 0;
  const beyond = planned + 1 - grownUpRoom(place);
  return beyond > 0 ? beyond * P.crowdPenalty * 100 : 0;
}

/**
 * The lanterns a place will have lit by the hour they set off, in hundredths (they plan at 17:00,
 * before the lights go on at 18:00, and judge a place as it will be when they get there).
 */
function lightsAhead(state: WorldState, place: Place, hour: number): number {
  if (place.parts.lit > 0 || hour < P.litHour) return 0;
  return placeFeatures(state, place) & PlaceFeature.light ? P.litBonus * 100 : 0;
}

/**
 * The hour to set off for a first stop: of the hours from `from` to `last` with room, the best (its
 * lanterns lit by then, less a little for each hour of waiting; the earliest of equals); with no room
 * in any hour, now, less the crowd.
 */
function bestHour(
  state: WorldState,
  place: Place,
  counts: Map<PlaceId, number[]>,
  base: number,
  from: number,
  last: number,
): [hour: number, score: number] {
  let best: [number, number] | null = null;
  for (let hour = from; hour <= last; hour++) {
    if (crowding(place, counts, hour) > 0) continue;
    const score = base + lightsAhead(state, place, hour) - (hour - from) * P.waitPerHour * 100;
    if (!best || score > best[1]) best = [hour, score];
  }
  return best ?? [from, base + lightsAhead(state, place, from) - crowding(place, counts, from)];
}

/** One in n residents (by id and day) are the rain-shy and skip open-air places, as rain keeps them in. */
function rainShy(state: WorldState, r: Resident): boolean {
  if (eveningWeather(state) !== 'rain') return false;
  const n = Math.max(1, Math.round(100 / Math.max(1, P.rainSkipPercent)));
  return (r.id + dayIndex(state.tick)) % n === 0;
}

/** Places a resident may go to: their own porch only, room for grown-ups, shelter in the rain. */
function eligible(r: Resident, place: Place, rainy: boolean): boolean {
  if (place.household !== undefined && place.household !== r.householdId) return false;
  if (place.id.startsWith('festival:')) return false;
  if (grownUpRoom(place) <= 0) return false;
  if (rainy && !place.sheltered) return false;
  return true;
}

/** The result of planning: the stops, and whether a place was worth the walk. */
export interface Plan {
  stops: RoundStop[];
  /** No place in reach scored `minScore` (they stay in, or only visit a friend). */
  nowhere: boolean;
}

function stop(place: string, kind: RoundStopKind, tile: number, at: number): RoundStop {
  return { place, kind, tile, draw: 0, flags: 0, arrived: -1, at };
}

/**
 * Plans a resident's round for the window (19-evenings.md, The round: Choosing): the shop first when
 * the pantry is low; the best place in reach (one resident in two takes their second best first), or a
 * friend's home when that scores better; then up to `maxStops` in all, each the best place of a kind
 * not yet visited within `nextStopRadius` of the last. Each stop gets the hour they set off for it: a
 * place full at the first hour may have room at a later one (a seat serves three or four an evening),
 * so the evening spreads instead of everyone arriving at one bench at 17:00.
 */
export function planRound(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  window: RoundWindow,
): Plan {
  if (window === 'evening' && eveningWeather(state) === 'storm') return { stops: [], nowhere: false };
  const rng = ctx.rng('round');
  const day = dayIndex(state.tick);
  const counts = plannedCounts(state);
  const stops: RoundStop[] = [];
  const now = tickOfDay(state.tick);
  let endTick = window === 'evening' ? homeTick(state) : P.eveningHour * HOUR;
  let fromTick = now;
  if (window === 'evening') {
    // Their own evening: a Night Owl is free later, an Early Bird home earlier (the schedule clock).
    const clock = scheduleClock(r, state.tick);
    if (clock < P.eveningHour * HOUR) fromTick = now + (P.eveningHour * HOUR - clock);
    endTick = Math.min(endTick, now + Math.max(0, P.homeHour * HOUR - clock));
  }
  const endHour = Math.floor(endTick / HOUR);
  let fromHour = Math.floor(fromTick / HOUR);

  // Shopping first, by one member of the household; places wait the hour after.
  if (needsShopping(h) && !someoneShopping(state, h) && !householdShops(state, h, r)) {
    const outlet = nearestOutletWithFood(state, homeDoor);
    const door = outlet ? doorOf(state, outlet) : -1;
    if (door >= 0) {
      stops.push(stop(`shop:${outlet}`, 'shop', door, now));
      fromHour += 1;
    }
  }
  const lastHour = endHour - 1;
  const at = (hour: number) => Math.max(fromTick, hour * HOUR);

  const rainy = rainShy(state, r);
  const candidates: Candidate[] = [];
  if (fromHour <= lastHour) {
    for (const place of placesNear(state, homeDoor, leisureRadius(r))) {
      if (!eligible(r, place, rainy)) continue;
      const tile = approachTile(state, place);
      if (tile < 0) continue;
      const [hour, score] = bestHour(
        state,
        place,
        counts,
        liking(state, rng, r, place, homeDoor),
        fromHour,
        lastHour,
      );
      if (score >= P.minScore * 100) candidates.push({ place, tile, hour, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || (a.place.id < b.place.id ? -1 : 1));

  // A friend's home: a draw of its own, no bonus for the friend.
  const [friend, friendDoor] = chooseVisit(state, r);
  let visit: { score: number; household: number; door: number } | null = null;
  if (friend && friendDoor >= 0 && fromHour <= lastHour) {
    const fh = householdOf(state, findById(state.residents, friend)!);
    const score =
      P.visitDraw * 100 -
      manhattan(homeDoor, friendDoor) * P.distanceHundredths +
      (rng.int(2 * P.whim + 1) - P.whim) * 100;
    if (fh && score >= P.minScore * 100) visit = { score, household: fh.id, door: friendDoor };
  }

  const nowhere = candidates.length === 0;
  let first: Candidate | null = candidates[0] ?? null;
  const secondFirst = ((r.id * 31 + day * 17) >>> 0) % 100 < P.secondBestPercent;
  if (secondFirst && candidates.length > 1) first = candidates[1]!;
  if (visit && (!first || visit.score > first.score)) {
    stops.push(stop(`home:${visit.household}`, 'visit', visit.door, at(fromHour)));
    return { stops, nowhere };
  }
  if (!first) return { stops, nowhere };

  const chosen: Place[] = [first.place];
  stops.push(stop(first.place.id, kindOf(first.place), first.tile, at(first.hour)));
  const kinds = new Set(first.place.kinds);
  let last = first.place.tile;
  let hour = first.hour;
  while (chosen.length < P.maxStops && hour + 1 <= lastHour) {
    hour += 1;
    let best: Candidate | null = null;
    for (const c of candidates) {
      if (chosen.includes(c.place)) continue;
      if (manhattan(last, c.place.tile) > P.nextStopRadius) continue;
      if (!c.place.kinds.some((k) => !kinds.has(k))) continue;
      const score =
        liking(state, rng, r, c.place, last) +
        lightsAhead(state, c.place, hour) -
        crowding(c.place, counts, hour);
      if (score < P.minScore * 100) continue;
      if (!best || score > best.score) best = { place: c.place, tile: c.tile, hour, score };
    }
    if (!best) break;
    chosen.push(best.place);
    for (const k of best.place.kinds) kinds.add(k);
    stops.push(stop(best.place.id, kindOf(best.place), best.tile, at(hour)));
    last = best.place.tile;
  }
  return { stops, nowhere };
}

/** True when another member of the household already plans the shop tonight. */
function householdShops(state: WorldState, h: Household, self: Resident): boolean {
  const day = dayIndex(state.tick);
  for (const id of h.members) {
    if (id === self.id) continue;
    const o = findById(state.residents, id);
    if (!o || o.roundDay !== day || !o.round) continue;
    if (o.round.some((s) => s.kind === 'shop' && !(s.flags & RoundFlags.turnedAway))) return true;
  }
  return false;
}

/**
 * Plans the window's round now and writes it on the resident (the evening's stops after the
 * afternoon's when both are today's), counting the evening's grown-ups and those with nowhere to go.
 */
export function makePlan(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  h: Household,
  homeDoor: number,
  window: RoundWindow,
): void {
  const day = dayIndex(state.tick);
  const plan = planRound(state, ctx, r, h, homeDoor, window);
  if (r.roundDay !== day || !r.round || window === 'afternoon') r.round = [];
  r.roundDay = day;
  const start = r.round.length;
  if (window === 'evening') r.roundEvening = start;
  else delete r.roundEvening;
  const counts = plannedCounts(state);
  for (const s of plan.stops) {
    r.round.push(s);
    countPlan(counts, s);
  }
  if (window === 'evening') {
    const tally = state.evenings.tonight;
    tally.grownups += 1;
    if (plan.nowhere && tally.weather !== 'storm') tally.nowhere += 1;
  }
}

// --- Following the round ---------------------------------------------------------------------------

/** The friend's home building for a visit stop (`home:<household id>`), or 0. */
export function visitHome(state: WorldState, s: RoundStop): number {
  if (s.kind !== 'visit') return 0;
  return findById(state.households, Number(s.place.slice(5)))?.homeId ?? 0;
}

/** The building a sheltered host stop is spent inside (`host:<id>`), or 0. */
export function hostInside(state: WorldState, s: RoundStop): number {
  if (!s.place.startsWith('host:')) return 0;
  const place = placeById(state, s.place);
  return place?.sheltered ? Number(s.place.slice(5)) : 0;
}

/** True while the resident is still at a stop they arrived at. */
export function atStop(state: WorldState, r: Resident, s: RoundStop): boolean {
  if (r.move) return false;
  const home = visitHome(state, s);
  if (home) return r.inside === home;
  const inside = hostInside(state, s);
  if (inside && r.inside === inside) return true;
  return r.inside === 0 && r.tile === s.tile;
}

/** True when a stop is behind them: turned away, or arrived and its hour is up or they left it. */
export function stopDone(state: WorldState, r: Resident, s: RoundStop): boolean {
  if (s.flags & RoundFlags.turnedAway) return true;
  if (s.arrived < 0) return false;
  if (s.kind === 'shop') return r.activity.kind !== 'shop';
  return state.tick - s.arrived >= STOP_TICKS || !atStop(state, r, s);
}

/** The index of the stop under way or next in the window's round, or -1 when it is over. */
export function currentStop(state: WorldState, r: Resident, window: RoundWindow): number {
  const round = r.round;
  if (!round) return -1;
  for (let k = windowStart(r, window); k < round.length; k++) if (!stopDone(state, r, round[k]!)) return k;
  return -1;
}

/** True when this is the resident's first evening stop at a place tonight (they went out). */
function firstOut(r: Resident, k: number): boolean {
  const round = r.round!;
  for (let j = r.roundEvening ?? 0; j < k; j++) {
    const s = round[j]!;
    if (s.kind !== 'shop' && s.kind !== 'visit' && s.flags & RoundFlags.arrived) return false;
  }
  return true;
}

/** True when the resident already stood somewhere tonight. */
function stoodBefore(r: Resident, k: number): boolean {
  const round = r.round!;
  for (let j = r.roundEvening ?? 0; j < k; j++) if (round[j]!.flags & RoundFlags.standing) return true;
  return false;
}

/** True when a friend (level 1+) is at the place now. */
function friendThere(state: WorldState, r: Resident, place: PlaceId): boolean {
  for (const f of r.friends) {
    if (f.level < 1) continue;
    const o = findById(state.residents, f.id);
    if (o && stopNow(state, o)?.place === place) return true;
  }
  return false;
}

/**
 * They reached stop k: a seat, then standing room, or turned away. Sets the RoundFlags, the draw as
 * found and the tick, counts the visitor on the place's row (recordVisit) and the evening's tally.
 * Returns false when they were turned away (they go on to the next stop, or home).
 */
export function arriveAt(state: WorldState, r: Resident, k: number, window: RoundWindow): boolean {
  const s = r.round![k]!;
  const evening = window === 'evening';
  if (s.kind === 'visit') {
    s.flags |= RoundFlags.arrived;
    s.arrived = state.tick;
    s.draw = P.visitDraw;
    return true;
  }
  const place = placeById(state, s.place);
  if (!place) {
    s.flags |= RoundFlags.turnedAway;
    return false;
  }
  const o = occupancy(state, place.id);
  const seat = place.seats - place.childSeats - o.seated > 0;
  if (!seat && place.standing - o.standing <= 0) {
    s.flags |= RoundFlags.turnedAway;
    return false;
  }
  let flags = (seat ? RoundFlags.seated : RoundFlags.standing) | RoundFlags.arrived;
  if (friendThere(state, r, place.id)) flags |= RoundFlags.friend;
  const tally = state.evenings.tonight;
  if (evening && tally.day === dayIndex(state.tick)) {
    if (firstOut(r, k)) tally.out += 1;
    if (flags & RoundFlags.standing && !stoodBefore(r, k)) tally.stood += 1;
  }
  s.flags |= flags;
  s.arrived = state.tick;
  s.draw = placeDraw(state, place);
  // The rows count evenings: an afternoon's stop takes its seat but is not an evening's visitor.
  if (evening) recordVisit(state, place.id, r, s.flags);
  occupy(state, place.id, r, flags);
  return true;
}

/** The shop stop under way: they reached the outlet's door (the errand itself is shopping's). */
export function arriveAtShop(state: WorldState, r: Resident): void {
  if (r.activity.kind !== 'shop' || r.move || !r.round || r.roundDay !== dayIndex(state.tick)) return;
  const k = currentStop(state, r, 'evening');
  const s = k >= 0 ? r.round[k]! : undefined;
  if (!s || s.kind !== 'shop' || s.arrived >= 0) return;
  if (s.place !== `shop:${r.activity.outlet}` || r.tile !== doorOf(state, r.activity.outlet)) return;
  s.flags |= RoundFlags.arrived;
  s.arrived = state.tick;
}

/**
 * The festival on its night (it keeps its own rules, 12-hearth.md): a guest who reached the site has
 * it on their round as a stop, counted once.
 */
export function noteFestival(state: WorldState, r: Resident): void {
  const day = dayIndex(state.tick);
  const place = placeIndex(state).places.find((p) => p.id.startsWith('festival:'));
  if (!place || r.roundDay !== day || r.roundEvening === undefined || !r.round) return;
  if (r.round.some((s) => s.place === place.id)) return;
  r.round.push(stop(place.id, 'meet', r.tile, tickOfDay(state.tick)));
  const k = r.round.length - 1;
  if (!arriveAt(state, r, k, 'evening')) {
    // A festival turns nobody away: they stand at its edge.
    const s = r.round[k]!;
    s.flags = RoundFlags.arrived | RoundFlags.standing;
    s.arrived = state.tick;
    s.draw = placeDraw(state, place);
    recordVisit(state, place.id, r, s.flags);
  }
}
