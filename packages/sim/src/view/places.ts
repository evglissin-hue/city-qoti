// R2 (R2.0): the places' views (docs/spec/20-architecture.md, R2 contracts): places, streets, a
// resident's round, footfall. R2A owns this file. Panels read these through the Mirror, never the sim.
import { content } from '@qoti/content';
import type {
  FootfallView,
  Place,
  PlacesView,
  PlaceView,
  Resident,
  RoundStopView,
  StreetView,
  WorldState,
} from '../contracts';
import { findById } from '../state/entities';
import { placeState, shownName } from '../state/evenings';
import { placeIndex } from '../systems/places';
import { placeDraw, placeServes } from '../systems/places/api';
import { streetTiles } from '../systems/places/streets';

/** A place for the card and lists: the derived place, its saved row and the live parts. */
export function placeView(state: WorldState, place: Place): PlaceView {
  const row = placeState(state, place.id);
  const live = placeDraw(state, place);
  const view: PlaceView = {
    id: place.id,
    name: row ? shownName(row) : place.def,
    generated: row?.name ?? place.def,
    source: place.source,
    def: place.def,
    tile: place.tile,
    tiles: [...place.tiles],
    members: [...place.members],
    seats: place.seats,
    childSeats: place.childSeats,
    standing: place.standing,
    kinds: [...place.kinds],
    sheltered: place.sheltered,
    warm: place.warm,
    serves: placeServes(state, place),
    draw: live,
    parts: { ...place.parts, treats: live - place.draw + place.parts.treats },
    visitors: row ? [...row.visitors] : [],
    takings: row ? [...row.takings] : [],
    sold: row ? [...row.sold] : [],
    // R2 stand-in (R2A): who is there now and what it still wants are R2A's to fill.
    present: 0,
    wants: [],
  };
  if (row?.renamedBy !== undefined) view.renamedBy = row.renamedBy;
  if (place.household !== undefined) view.household = place.household;
  return view;
}

/** `places.updated` and the snapshot: every place the pass finds now, sorted by id. */
export function placesView(state: WorldState): PlacesView {
  return { places: placeIndex(state).places.map((p) => placeView(state, p)) };
}

/** Every named street, sorted by id, with its run's tiles. */
export function streetViews(state: WorldState): StreetView[] {
  return state.streets.map((s) => {
    const view: StreetView = {
      id: s.id,
      name: shownName(s),
      generated: s.name,
      anchor: s.anchor,
      tiles: streetTiles(state, s),
    };
    if (s.renamedBy !== undefined) view.renamedBy = s.renamedBy;
    return view;
  });
}

/** A round's stops with names, for the inspector's line of stops. */
export function roundStopViews(state: WorldState, r: Resident): RoundStopView[] {
  return (r.round ?? []).map((stop) => ({ ...stop, name: stopName(state, stop.place) }));
}

/** Copies of the footfall layers (FootfallView). */
export function footfallView(state: WorldState): FootfallView {
  return { day: state.map.footfallDay.slice(), eve: state.map.footfallEve.slice() };
}

function stopName(state: WorldState, place: string): string {
  if (place.startsWith('shop:')) {
    const b = findById(state.buildings, Number(place.slice(5)));
    return b ? (content.buildingById.get(b.def)?.name ?? b.def) : 'the shop';
  }
  if (place.startsWith('home:')) {
    const h = findById(state.households, Number(place.slice(5)));
    return h ? `the ${h.family}s'` : 'a friend';
  }
  const row = placeState(state, place);
  return row ? shownName(row) : 'somewhere';
}
