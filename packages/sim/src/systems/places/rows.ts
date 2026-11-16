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
const announced = new WeakMap<WorldState, string>();

/** A derived summary of what the places list shows structurally: ids, room, kinds, outlets, draw. */
function fingerprint(state: WorldState): string {
  let s = '';
  for (const p of placeIndex(state).places) {
    s += `${p.id}|${p.seats}|${p.childSeats}|${p.standing}|${p.kinds.join(',')}|${p.outlets.join(',')}|${p.draw};`;
  }
  return s;
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
