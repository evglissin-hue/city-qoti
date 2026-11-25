// The saved rows (docs/spec/19-evenings.md, Data and budgets): what the town remembers of each place
// by its stable id. The hourly pass names a place it finds for the first time, marks every row it
// finds as seen today, and drops a row it has not found for `PLACES.forgetDays` days; it emits
// `places.updated` when something changed.
import { content } from '@qoti/content';
import type { Place, PlaceState, TickCtx, WorldState } from '../../contracts';
import { newPlaceState, placeState } from '../../state/evenings';
import { placesView } from '../../view/places';
import { hourOf } from '../economy/time';
import { dayIndex } from '../residents/time';
import { placeServes } from './api';
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

/** Each place's structural part of the fingerprint (a place object never changes once built). */
const prints = new WeakMap<Place, number>();

function structural(p: Place): number {
  let h = prints.get(p);
  if (h !== undefined) return h;
  h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h! ^ (v | 0), 0x01000193);
  };
  for (let i = 0; i < p.id.length; i++) mix(p.id.charCodeAt(i));
  mix(p.seats);
  mix(p.childSeats);
  mix(p.standing);
  let kinds = 0;
  for (const k of p.kinds) kinds |= KIND_BITS.get(k) ?? 0;
  mix(kinds);
  mix(p.outlets.length);
  for (const o of p.outlets) mix(o);
  prints.set(p, h);
  return h;
}

/** A derived hash of what the places list shows structurally: ids, room, kinds, outlets, draw. */
function fingerprint(state: WorldState): number {
  let h = 0x811c9dc5;
  for (const p of placeIndex(state).places) {
    h = Math.imul(h ^ structural(p), 0x01000193);
    h = Math.imul(h ^ (p.draw | 0), 0x01000193);
  }
  return h >>> 0;
}

/**
 * The hourly pass over the rows (called by the places system after the patterns pass): a place found
 * for the first time gets a row and a name, a row found again is marked seen today, a row not found
 * for `forgetDays` days is dropped. Emits `places.updated` when a row came or went, when the places
 * changed since the last announcement, and always at the evening's close (`homeHour`, with its counts).
 */
export function refreshRows(state: WorldState, ctx: TickCtx): void {
  const today = dayIndex(state.tick);
  const forget = content.places.forgetDays;
  const found = placeIndex(state).places;
  const rows = state.places;
  let changed = false;
  // Names in use (every row's, the ones about to be forgotten too), made when a place needs naming.
  let taken: Set<string> | null = null;
  // Rows and places are both sorted by id: walk them together.
  const merged: PlaceState[] = [];
  let i = 0;
  const pass = (row: PlaceState) => {
    if (today - row.seenDay <= forget) merged.push(row);
    else changed = true;
  };
  for (const place of found) {
    while (i < rows.length && rows[i]!.id < place.id) pass(rows[i++]!);
    if (i < rows.length && rows[i]!.id === place.id) {
      const row = rows[i++]!;
      row.seenDay = today;
      merged.push(row);
      continue;
    }
    if (!taken) {
      taken = new Set<string>();
      for (const row of rows) taken.add(row.name);
    }
    const name = placeNameFor(state, place, taken);
    taken.add(name);
    merged.push(newPlaceState(place.id, name, today));
    changed = true;
  }
  while (i < rows.length) pass(rows[i++]!);
  if (changed) rows.splice(0, rows.length, ...merged);

  countServed(state, found);

  const print = fingerprint(state);
  const homeNow = hourOf(state.tick) === content.places.homeHour;
  if (changed || homeNow || announced.get(state) !== print) {
    announced.set(state, print);
    ctx.events.push({ e: 'places.updated', p: placesView(state) });
  }
}

/**
 * R3X: `PlaceState.served` was never written (the gaps' "had nothing to sell" could not end, the Shops
 * bar read every place as unserved). From 18:00 to the evening's close each hourly pass counts the
 * outlets of each place with Treats on the shelf and keeps the evening's most, so a shelf the round
 * emptied by 21:00 still counts as having served. recordSale also counts a sale at a stop (api.ts).
 */
function countServed(state: WorldState, found: readonly Place[]): void {
  const hour = hourOf(state.tick);
  if (hour < 18 || hour > content.places.homeHour) return;
  for (const place of found) {
    const row = placeState(state, place.id);
    if (!row || row.served.length === 0) continue;
    const last = row.served.length - 1;
    // Only a place someone came to tonight: the gap and the Shops bar read busy places, and a City's
    // hundreds of quiet ones would cost the hourly pass its budget (r2a places city).
    if ((row.visitors[row.visitors.length - 1] ?? 0) === 0) continue;
    const n = placeServes(state, place).length;
    if (n > row.served[last]!) row.served[last] = n;
  }
}
