// R2 (R2.0): the evening round's saved slices, empty, and the helpers every R2 track shares for place
// ids and names (docs/spec/19-evenings.md, Data and budgets). Shapes are fixed here; bug fixes by
// anyone, listed in the PR.
import { content } from '@qoti/content';
import { MAP_SIZE, MAX_PLACE_NAME_CHARS, NEED_IDS, PLACE_EVENINGS } from '../constants';
import type {
  EntityId,
  EveningsState,
  EveningTally,
  GapsState,
  PlaceId,
  PlaceState,
  Resident,
  WorldState,
} from '../contracts';

/** An evening's tally before anyone planned. */
export function emptyTally(day = -1): EveningTally {
  return {
    day,
    weather: 'fair',
    grownups: 0,
    out: 0,
    nowhere: 0,
    stood: 0,
    scoreSum: 0,
    friendships: 0,
    treatsAtStops: 0,
    treatsPassing: 0,
    treatsDoorstep: 0,
    takings: 0,
  };
}

export function emptyEvenings(): EveningsState {
  return { tonight: emptyTally(), history: [], outRun: 0, allOut: 0, stoodThisSeason: 0, seatedSeasons: 0 };
}

export function emptyGaps(): GapsState {
  return { open: [], closed: [], streaks: [], closedCount: 0, closedBySeat: [0, 0, 0, 0], credited: [] };
}

export function emptyEveningsSlices(): Pick<WorldState, 'places' | 'gaps' | 'streets' | 'evenings'> {
  return { places: [], gaps: emptyGaps(), streets: [], evenings: emptyEvenings() };
}

// --- Place ids (PlaceId) ---------------------------------------------------------------------------

export const sitePlaceId = (pattern: string, anchor: number): PlaceId => `site:${pattern}:${anchor}`;
export const seatsPlaceId = (lowestSeatPiece: EntityId): PlaceId => `seats:${lowestSeatPiece}`;
export const porchPlaceId = (home: EntityId): PlaceId => `porch:${home}`;
export const hostPlaceId = (building: EntityId): PlaceId => `host:${building}`;
export const firePlaceId = (decor: EntityId): PlaceId => `fire:${decor}`;
export const icePlaceId = (tile: number): PlaceId => `ice:${tile}`;
export const festivalPlaceId = (anchor: number): PlaceId => `festival:${anchor}`;

/** Sorts place rows (or anything with a string id) the way state.places keeps them: `<`, never localeCompare. */
export function byPlaceId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The saved row for a place, or undefined (binary search: state.places is sorted by id). */
export function placeState(state: WorldState, id: PlaceId): PlaceState | undefined {
  const list = state.places;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = list[mid]!;
    if (row.id === id) return row;
    if (row.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** A fresh saved row for a place first found today: zeroed evenings, the evening under way included. */
export function newPlaceState(id: PlaceId, name: string, day: number): PlaceState {
  return { id, name, visitors: [0], takings: [0], sold: [0], served: [0], firstDay: day, seenDay: day };
}

/** Pushes a fresh evening onto each of a place's per-evening arrays, keeping the last PLACE_EVENINGS. */
export function startPlaceEvening(row: PlaceState): void {
  for (const a of [row.visitors, row.takings, row.sold, row.served]) {
    a.push(0);
    while (a.length > PLACE_EVENINGS) a.shift();
  }
}

/** The name to show: a seat's rename, else the generated one. */
export function shownName(row: { name: string; custom?: string }): string {
  return row.custom ?? row.name;
}

/**
 * A seat's name for a place or street, cleaned: control characters out, spaces collapsed, trimmed,
 * at most MAX_PLACE_NAME_CHARS. Returns '' for a name with nothing left (which brings the generated
 * one back) and null when it is too long.
 */
export function cleanName(raw: string): string | null {
  let spaced = '';
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    spaced += code < 32 || code === 127 ? ' ' : ch;
  }
  const name = spaced.replace(/\s+/g, ' ').trim();
  return name.length > MAX_PLACE_NAME_CHARS ? null : name;
}

// --- Residents -----------------------------------------------------------------------------------

/** Index of the evenings need in Resident.needs. */
export const EVENINGS_NEED = NEED_IDS.indexOf('evenings');

/** A newcomer's evenings need (content.places.needStart). */
export function startingEvenings(): number {
  return content.places.needStart;
}

/** The evenings need, 0 to 100 (a resident from before the need existed reads the start value). */
export function eveningsNeed(r: Resident): number {
  return r.needs[EVENINGS_NEED] ?? startingEvenings();
}

/** Tile index helpers for place and street code (z * MAP_SIZE + x). */
export function tileOf(x: number, z: number): number {
  return z * MAP_SIZE + x;
}
