// R2 (R2.0): the places' views (docs/spec/20-architecture.md, R2 contracts): places, streets, a
// resident's round, footfall. R2A owns this file. Panels read these through the Mirror, never the sim.
import { placeResting, placeSupplies } from './supplies';
import { content, placeWords as W } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import { decorTileX, decorTileZ } from '../conditions/geo';
import type {
  FootfallView,
  Place,
  PlacesView,
  PlaceState,
  PlaceView,
  Resident,
  RestingView,
  RoundStopView,
  StreetView,
  WorldState,
} from '../contracts';
import { findById } from '../state/entities';
import { placeState, shownName } from '../state/evenings';
import { hourOf } from '../systems/economy/time';
import { placeIndex } from '../systems/places';
import { placeServes } from '../systems/places/api';
import { presentAt } from '../systems/places/occupancy';
import { streetTiles } from '../systems/places/streets';

/** Tiles that hold a light or lantern, kept per tick and turn (the decor list changes rarely). */
const lightMemo = new WeakMap<WorldState, { tick: number; turn: number; n: number; tiles: Set<number> }>();

function lightTiles(state: WorldState): Set<number> {
  const m = lightMemo.get(state);
  if (m && m.tick === state.tick && m.turn === state.lastTurn && m.n === state.decor.length) return m.tiles;
  const tiles = new Set<number>();
  for (const d of state.decor) {
    const tags = content.decorById.get(d.def)?.tags;
    if (tags && (tags.includes('light') || tags.includes('lantern')))
      tiles.add(decorTileZ(d) * MAP_SIZE + decorTileX(d));
  }
  lightMemo.set(state, { tick: state.tick, turn: state.lastTurn, n: state.decor.length, tiles });
  return tiles;
}

/** Visitors of the last closed evening (the evening under way is the last entry from 17:00 to 21:00). */
function lastClosedVisitors(state: WorldState, visitors: readonly number[]): number {
  const h = hourOf(state.tick);
  const underWay = h >= content.places.eveningHour && h < content.places.homeHour;
  return visitors[visitors.length - (underWay ? 2 : 1)] ?? 0;
}

function fillN(template: string, n: number): string {
  return template.replace('{n}', String(n));
}

/** What a place still wants, up to three short clauses (lower case, no final period). */
function wantsOf(
  state: WorldState,
  place: Place,
  view: PlaceView,
  resting?: readonly RestingView[],
): string[] {
  const P = content.places;
  const out: string[] = [];
  const came = lastClosedVisitors(state, view.visitors);
  if (view.serves.length === 0 && came >= P.unservedVisitors) out.push(fillN(W.wantStall, came));
  const grown = place.seats - place.childSeats;
  const slots = Math.floor(((P.homeHour - P.eveningHour) * 60) / P.stopMinutes);
  if (grown <= 0) {
    if (came > 0) out.push(fillN(W.wantBench, came));
  } else if (came > grown * slots) out.push(fillN(W.wantSeats, came));
  if (!place.sheltered && !hasLight(state, place)) out.push(W.wantLantern);
  // R3X: a place whose fire stands cold wants firewood, not another brazier (the card told a player
  // with a cold brazier to build a brazier).
  if (place.parts.winter < 0)
    out.push(resting?.some((p) => p.kind === 'cold') ? (W.wantFirewood ?? W.wantBrazier) : W.wantBrazier);
  return out.slice(0, 3);
}

function hasLight(state: WorldState, place: Place): boolean {
  const lit = lightTiles(state);
  for (const t of place.tiles) if (lit.has(t)) return true;
  return false;
}

/** A place for the card and lists: the derived place, its saved row and the live parts. */
export function placeView(state: WorldState, place: Place): PlaceView {
  return viewOf(state, place, placeState(state, place.id));
}

function viewOf(state: WorldState, place: Place, row: PlaceState | undefined): PlaceView {
  // The live draw as placeDraw reads it, from the one read of the shelves.
  const serves = placeServes(state, place);
  const live = Math.max(0, Math.min(100, place.draw + (serves.length > 0 ? content.places.treatsBonus : 0)));
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
    serves,
    draw: live,
    parts: { ...place.parts, treats: live - place.draw + place.parts.treats },
    visitors: row ? [...row.visitors] : [],
    takings: row ? [...row.takings] : [],
    sold: row ? [...row.sold] : [],
    present: presentAt(state, place.id),
    wants: [],
  };
  // R3.0: its priority, supplies and resting pieces (R3A), and the Town Book's pages found there (R3C).
  const resting = placeResting(state, place);
  view.wants = wantsOf(state, place, view, resting);
  if (row?.renamedBy !== undefined) view.renamedBy = row.renamedBy;
  if (place.household !== undefined) view.household = place.household;
  if (row?.priority !== undefined) view.priority = row.priority;
  const supplies = placeSupplies(state, place);
  if (supplies) view.supplies = supplies;
  if (resting) view.resting = resting;
  const pages = state.townBook.pages.filter((p) => p.place === place.id).map((p) => p.id);
  if (pages.length > 0) view.pages = pages;
  return view;
}

/** `places.updated` and the snapshot: every place the pass finds now, sorted by id. */
export function placesView(state: WorldState): PlacesView {
  // Rows and places are both sorted by id: walk them together.
  const rows = state.places;
  let i = 0;
  return {
    places: placeIndex(state).places.map((p) => {
      while (i < rows.length && rows[i]!.id < p.id) i++;
      return viewOf(state, p, i < rows.length && rows[i]!.id === p.id ? rows[i] : undefined);
    }),
  };
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
