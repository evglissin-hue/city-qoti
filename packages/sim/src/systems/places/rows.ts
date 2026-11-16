// The saved rows (docs/spec/19-evenings.md, Data and budgets): what the town remembers of each place
// by its stable id. The hourly pass names a place it finds for the first time, marks every row it
// finds as seen today, and drops a row it has not found for `PLACES.forgetDays` days; it emits
// `places.updated` when something changed.
import { content } from '@qoti/content';
import type { PlaceState, TickCtx, WorldState } from '../../contracts';
import { byPlaceId, newPlaceState, placeState } from '../../state/evenings';
import { placesView } from '../../view/places';
import { hourOf } from '../economy/time';
import { dayIndex } from '../residents/time';
import { placeIndex } from './index';
import { placeNameFor } from './names';

/** The last fingerprint of the places we announced (events are presentation, never hashed). */
const announced = new WeakMap<WorldState, number>();

const KIND_BITS = new Map<string, number>([
  ['sit', 1],
  ['eat', 2],
  ['view', 4],
  ['play', 8],
  ['meet', 16],
  ['walk', 32],
]);

/** A derived hash of what the places list shows structurally: ids, room, kinds, outlets, draw. */
function fingerprint(state: WorldState): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193);
  };
  for (const p of placeIndex(state).places) {
    for (let i = 0; i < p.id.length; i++) mix(p.id.charCodeAt(i));
    mix(p.seats);
    mix(p.childSeats);
    mix(p.standing);
    let kinds = 0;
    for (const k of p.kinds) kinds |= KIND_BITS.get(k) ?? 0;
    mix(kinds);
    mix(p.outlets.length);
    for (const o of p.outlets) mix(o);
    mix(p.draw);
  }
  return h >>> 0;
}

/** Inserts a row keeping `state.places` sorted by id. */
function insertRow(state: WorldState, row: PlaceState): void {
  const list = state.places;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (byPlaceId(list[mid]!, row) < 0) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, row);
}

/**
 * The hourly pass over the rows (called by the places system after the patterns pass): a place found
 * for the first time gets a row and a name, a row found again is marked seen today, a row not found
 * for `forgetDays` days is dropped. Emits `places.updated` when a row came or went, when the places
 * changed since the last announcement, and always at the evening's close (`homeHour`, with its counts).
 */
export function refreshRows(state: WorldState, ctx: TickCtx): void {
  const today = dayIndex(state.tick);
  const found = placeIndex(state).places;
  let changed = false;
  const taken = new Set<string>();
  for (const row of state.places) taken.add(row.name);
  const seen = new Set<string>();
  for (const place of found) {
    seen.add(place.id);
    const row = placeState(state, place.id);
    if (row) {
      row.seenDay = today;
      continue;
    }
    const name = placeNameFor(state, place, taken);
    taken.add(name);
    insertRow(state, newPlaceState(place.id, name, today));
    changed = true;
  }
  const keep: PlaceState[] = [];
  for (const row of state.places) {
    if (seen.has(row.id) || today - row.seenDay <= content.places.forgetDays) keep.push(row);
    else changed = true;
  }
  if (keep.length !== state.places.length) state.places.splice(0, state.places.length, ...keep);

  const print = fingerprint(state);
  const homeNow = hourOf(state.tick) === content.places.homeHour;
  if (changed || homeNow || announced.get(state) !== print) {
    announced.set(state, print);
    ctx.events.push({ e: 'places.updated', p: placesView(state) });
  }
}
