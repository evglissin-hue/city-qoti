// Who is at a place right now (docs/spec/19-evenings.md, The round: Seats): grown-ups seated, children
// seated, and folk standing, read from every resident's round. Derived, never saved: a resident is at
// a place while their latest stop is under way (arrived, seated or standing, within
// `PLACES.stopMinutes`), they are on leisure and still there (on the stop's tile, or inside the
// sheltered host it is). Counted once per tick and
// turn (the same key discipline as the place index), and kept up to date within the tick as folk
// arrive, so two arrivals in one tick never take the same seat.
import { content } from '@qoti/content';
import { RoundFlags, TICKS_PER_HOUR } from '../../constants';
import type { PlaceId, Resident, RoundStop, WorldState } from '../../contracts';
import { dayIndex } from '../residents/time';

/** Ticks a stop lasts. */
export const STOP_TICKS = Math.round((content.places.stopMinutes * TICKS_PER_HOUR) / 60);

export interface Occupancy {
  /** Grown-ups (young, adult, elder) in a seat. */
  seated: number;
  /** Children in a child's seat. */
  childSeated: number;
  standing: number;
}

interface Memo {
  tick: number;
  turn: number;
  byPlace: Map<PlaceId, Occupancy>;
}

const memos = new WeakMap<WorldState, Memo>();

/** The stop a resident is spending time at right now, or null (see the file header). */
export function stopNow(state: WorldState, r: Resident): RoundStop | null {
  const round = r.round;
  if (!round || round.length === 0 || r.roundDay !== dayIndex(state.tick)) return null;
  if (r.move || r.activity.kind !== 'leisure') return null;
  for (let k = round.length - 1; k >= 0; k--) {
    const stop = round[k]!;
    if (stop.arrived < 0) continue;
    if (!(stop.flags & (RoundFlags.seated | RoundFlags.standing))) return null;
    if (state.tick - stop.arrived >= STOP_TICKS) return null;
    // Still there: on its tile outdoors, or inside the sheltered host it is.
    if (r.inside) return stop.place === `host:${r.inside}` ? stop : null;
    return r.tile === stop.tile ? stop : null;
  }
  return null;
}

function count(state: WorldState): Map<PlaceId, Occupancy> {
  const out = new Map<PlaceId, Occupancy>();
  const day = dayIndex(state.tick);
  for (const r of state.residents) {
    // stopNow's first checks, once here: most of a town is not out on a round at any moment.
    if (r.roundDay !== day || !r.round || r.move || r.activity.kind !== 'leisure') continue;
    const stop = stopNow(state, r);
    if (stop) add(out, stop.place, r, stop.flags);
  }
  return out;
}

function add(map: Map<PlaceId, Occupancy>, place: PlaceId, r: Resident, flags: number): void {
  let o = map.get(place);
  if (!o) {
    o = { seated: 0, childSeated: 0, standing: 0 };
    map.set(place, o);
  }
  if (flags & RoundFlags.seated) {
    if (r.stage === 'child') o.childSeated += 1;
    else o.seated += 1;
  } else if (flags & RoundFlags.standing) o.standing += 1;
}

function memoFor(state: WorldState): Memo {
  let m = memos.get(state);
  if (!m || m.tick !== state.tick || m.turn !== state.lastTurn) {
    m = { tick: state.tick, turn: state.lastTurn, byPlace: count(state) };
    memos.set(state, m);
  }
  return m;
}

const EMPTY: Occupancy = { seated: 0, childSeated: 0, standing: 0 };

/** Who is at a place now (read only). */
export function occupancy(state: WorldState, place: PlaceId): Readonly<Occupancy> {
  return memoFor(state).byPlace.get(place) ?? EMPTY;
}

/** Residents at a place now, sitting or standing. */
export function presentAt(state: WorldState, place: PlaceId): number {
  const o = occupancy(state, place);
  return o.seated + o.childSeated + o.standing;
}

/** A resident just took a seat or standing room at a place in this tick (the arrival's own count). */
export function occupy(state: WorldState, place: PlaceId, r: Resident, flags: number): void {
  add(memoFor(state).byPlace, place, r, flags);
}
