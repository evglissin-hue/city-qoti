// R2 (R2.0): the evening round's views (docs/spec/20-architecture.md, R2 contracts): places, streets,
// gaps, the evening's tally and edition, footfall. Panels read these through the Mirror, never the sim.
// R2A owns placeView's `present` and `wants`, R2C the edition's lines; the shapes are fixed.
import { content } from '@qoti/content';
import type {
  EveningView,
  FootfallView,
  Gap,
  GapsView,
  GapView,
  Place,
  PlacesView,
  PlaceView,
  Resident,
  ResidentDetail,
  RoundStopView,
  StreetView,
  TownView,
  WorldState,
} from '../contracts';
import { findById } from '../state/entities';
import { eveningsNeed, placeState, shownName } from '../state/evenings';
import { placeIndex } from '../systems/places';
import { placeDraw, placeServes } from '../systems/places/api';
import { streetTiles } from '../systems/places/streets';
import { fillText } from './hamlet';

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

/** What a gap's subject is called in its words: the place's name, the shop's, the street's. */
function subjectName(state: WorldState, subject: string): string {
  if (subject.startsWith('building:')) {
    const b = findById(state.buildings, Number(subject.slice(9)));
    return b ? (content.buildingById.get(b.def)?.name ?? b.def) : 'A shop';
  }
  if (subject.startsWith('street:')) {
    const s = findById(state.streets, Number(subject.slice(7)));
    return s ? shownName(s) : 'A street';
  }
  const row = placeState(state, subject);
  return row ? shownName(row) : 'A place';
}

/** A gap in words (content.gaps), its placeholders filled. */
export function gapView(state: WorldState, gap: Gap): GapView {
  const def = content.gapByKind.get(gap.kind);
  const name = subjectName(state, gap.subject);
  const raw = def?.text[gap.id % Math.max(1, def.text.length)] ?? gap.kind;
  const view: GapView = {
    id: gap.id,
    kind: gap.kind,
    subject: gap.subject,
    tile: gap.tile,
    lane: def?.lane ?? 'hearth',
    text: fillText(raw, [
      ['place', name],
      ['shop', name],
      ['street', name],
      ['n', String(gap.n)],
    ]),
    closes: def?.closes ?? '',
    openedDay: gap.openedDay,
    n: gap.n,
  };
  if (gap.closedDay !== undefined) view.closedDay = gap.closedDay;
  if (gap.closers) view.closers = [...gap.closers];
  return view;
}

/** `gaps.updated` and the snapshot. */
export function gapsView(state: WorldState): GapsView {
  return {
    open: state.gaps.open.map((g) => gapView(state, g)),
    closed: state.gaps.closed.map((g) => gapView(state, g)),
    closedCount: state.gaps.closedCount,
    closedBySeat: [...state.gaps.closedBySeat],
  };
}

/**
 * The last evening's tally and edition, or null before the first evening.
 *
 * R2 stand-in (R2C): no edition lines and no places list yet; R2C writes both and emits
 * evening.closed with this view at 21:00.
 */
export function eveningView(state: WorldState): EveningView | null {
  const tally = state.evenings.tonight;
  if (tally.day < 0) return null;
  return { tally: { ...tally }, lines: [], places: [] };
}

/** Copies of the footfall layers (FootfallView). */
export function footfallView(state: WorldState): FootfallView {
  return { day: state.map.footfallDay.slice(), eve: state.map.footfallEve.slice() };
}

/** The Hearth's strip: the last evening's share out and average score, absent before the first. */
export function townEvenings(state: WorldState): TownView['evenings'] {
  const t = state.evenings.tonight;
  if (t.day < 0 || t.grownups === 0) return undefined;
  return { out: t.out, grownups: t.grownups, average: Math.round(t.scoreSum / t.grownups) };
}

/** A round's stops with names, for the inspector's line of stops. */
export function roundStopViews(state: WorldState, r: Resident): RoundStopView[] {
  return (r.round ?? []).map((stop) => ({ ...stop, name: stopName(state, stop.place) }));
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

/** The inspector's evening: the need and the last score, once they have had an evening. */
export function residentEvening(r: Resident): ResidentDetail['evening'] {
  if (!r.evening) return undefined;
  return { need: Math.round(eveningsNeed(r)), score: r.evening.score };
}
