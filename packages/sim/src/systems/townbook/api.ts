// The Town Book's cross-track API (R3.0 wired the readers; R3C wrote the bodies): docs/spec/19-evenings.md,
// The Town Book. The baskets' variety asks specialtiesOnRound, a place's draw asks placeSpecialty and
// customToday, recordSale tells townBookSale, the carrier asks specialtyGood, the conditions count
// pagesFound and pagesTogether. The draw runs per place per tick, so the readers share one derived
// index of the pages (never saved), rebuilt when the pages array changes: a seat that joins from a
// snapshot has a new array, so it builds its own and reads what its partner reads.
import { content, TOWN_BOOK } from '@qoti/content';
import { GOOD_FAMILIES } from '../../constants';
import type { Household, Place, PlaceId, PlaceState, TownBookPage, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { seasonAt } from '../../state/seasons';

interface PageIndex {
  /** Pages the index was built from (a page is only ever added). */
  length: number;
  /** Places with a specialty page. */
  specialtyPlaces: Set<PlaceId>;
  /** Places with a custom page: a bitmask of the days of the season (bit d - 1 for day d). */
  customDays: Map<PlaceId, number>;
  /** Goods (by index) with a specialty page. */
  goods: Set<number>;
  /** By the good's family index: the places of its specialty pages, one entry a page. */
  byFamily: Map<number, PlaceId[]>;
}

const indexes = new WeakMap<TownBookPage[], PageIndex>();

function pageIndex(state: WorldState): PageIndex {
  const pages = state.townBook.pages;
  const cached = indexes.get(pages);
  if (cached && cached.length === pages.length) return cached;
  const idx: PageIndex = {
    length: pages.length,
    specialtyPlaces: new Set(),
    customDays: new Map(),
    goods: new Set(),
    byFamily: new Map(),
  };
  for (const p of pages) {
    if (p.kind === 'specialty') {
      idx.specialtyPlaces.add(p.place);
      if (p.good === undefined) continue;
      idx.goods.add(p.good);
      const family = GOOD_FAMILIES.indexOf(content.goods[p.good]!.family);
      const list = idx.byFamily.get(family);
      if (list) list.push(p.place);
      else idx.byFamily.set(family, [p.place]);
    } else if (p.dayOfSeason !== undefined) {
      idx.customDays.set(p.place, (idx.customDays.get(p.place) ?? 0) | (1 << (p.dayOfSeason - 1)));
    }
  }
  indexes.set(pages, idx);
  return idx;
}

/**
 * Flavors of family index `family` a household gains from specialties its members' rounds pass (one
 * more flavor for each specialty of that family at a place on their round): the baskets' variety.
 */
export function specialtiesOnRound(state: WorldState, h: Household, family: number): number {
  if (state.townBook.pages.length === 0) return 0;
  const places = pageIndex(state).byFamily.get(family);
  if (!places) return 0;
  let n = 0;
  for (const place of places) {
    let passes = false;
    for (const id of h.members) {
      const r = findById(state.residents, id);
      if (r?.round?.some((stop) => stop.place === place)) {
        passes = true;
        break;
      }
    }
    if (passes) n++;
  }
  return n;
}

/** The draw a specialty adds to a place (`TOWN_BOOK.specialtyDraw`), 0 when none is sold there. */
export function placeSpecialty(state: WorldState, place: Place): number {
  if (state.townBook.pages.length === 0) return 0;
  return pageIndex(state).specialtyPlaces.has(place.id) ? TOWN_BOOK.specialtyDraw : 0;
}

/** The draw a custom adds to a place today (`TOWN_BOOK.customDraw`), 0 when none falls today. */
export function customToday(state: WorldState, place: Place): number {
  if (state.townBook.pages.length === 0) return 0;
  const days = pageIndex(state).customDays.get(place.id);
  if (days === undefined) return 0;
  return (days & (1 << (seasonAt(state.tick).day - 1))) !== 0 ? TOWN_BOOK.customDraw : 0;
}

/**
 * A Treat sold to the round at a place (recordSale calls it once a sale, after the place's row is
 * counted): `row` is the place's saved row, `good` the good index. Counts one customer of that good
 * for the evening under way; the close (systems/townbook) turns the counts into evenings.
 */
export function townBookSale(_state: WorldState, row: PlaceState, good: number): void {
  const n = (row.customers ??= new Array<number>(content.goods.length).fill(0));
  n[good] = (n[good] ?? 0) + 1;
}

/**
 * The good (by index) is one of the town's specialties: the carrier sells it to neighbors at their full
 * price (`cartPercent`, systems/carrier/terms.ts).
 */
export function specialtyGood(state: WorldState, good: number): boolean {
  if (state.townBook.pages.length === 0) return false;
  return pageIndex(state).goods.has(good);
}

/** True once a page of this custom (a content custom id) has been found. */
export function customFound(state: WorldState, id: string): boolean {
  for (const p of state.townBook.pages) if (p.kind === 'custom' && p.def === id) return true;
  return false;
}

/** Pages found; `ref` 'specialty' or 'custom' keeps that kind, a leaning keeps that leaning. */
export function pagesFound(state: WorldState, ref?: string): number {
  let n = 0;
  for (const p of state.townBook.pages) if (ref === undefined || p.kind === ref || p.leaning === ref) n++;
  return n;
}

/** Pages credited to two seats (Made Together). */
export function pagesTogether(state: WorldState): number {
  let n = 0;
  for (const p of state.townBook.pages) if (p.seats.length >= 2) n++;
  return n;
}
