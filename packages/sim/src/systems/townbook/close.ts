// The Town Book's evening close (docs/spec/19-evenings.md, The Town Book), run daily at 21:20 by the
// `townbook` system: it turns the evening's customers into evenings of the season and its visitors into
// runs of the same day, finds the pages those earn (a specialty, a day custom, a supply custom), credits
// the seats (Made Together), pays the renown, moves the hints on, and earns callings. One pass over
// the place rows (sorted by id), bounded by the rows: never a scan of the town, except when a page is
// found. Deterministic: rows in id order, defs in content order, ids from state.nextId.
import { callingPhrases, content, TOWN_BOOK, townBookPhrases } from '@qoti/content';
import { DAYS_PER_SEASON, LEANINGS, SUPPLY_KINDS } from '../../constants';
import type { PlaceState, SeatId, TickCtx, TownBookPage, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isMasterGood } from '../../state/masters';
import { seasonAt } from '../../state/seasons';
import { townView } from '../../view';
import { fillText } from '../../view/hamlet';
import { pageText, townBookView } from '../../view/townBook';
import { charterView } from '../../view/village';
import { chronicle } from '../chronicle/api';
import { creditText } from '../chronicle/text';
import { dayIndex } from '../economy/time';
import { buildingCredit, placeCredit } from '../gaps/credit';
import { markLanterns } from '../hearth/charm';
import { markCharmSoon } from '../hearth/charm/dirty';
import { placeById } from '../places/api';
import { addRenown } from '../renown/api';
import { defPossible } from './achievable';
import { specialtyName } from './names';

/** Defs in the order their hints are revealed: base-good specialties, day customs, supply customs, masters' goods. */
export const HINT_ORDER: readonly string[] = (() => {
  const isMaster = (good: string): boolean => {
    const g = content.goodIndex.get(good);
    return g !== undefined && isMasterGood(g);
  };
  return [
    ...content.specialties.filter((s) => !isMaster(s.good)).map((s) => s.id),
    ...content.customs.filter((c) => c.kind === 'day').map((c) => c.id),
    ...content.customs.filter((c) => c.kind === 'supply').map((c) => c.id),
    ...content.specialties.filter((s) => isMaster(s.good)).map((s) => s.id),
  ];
})();

/** The seats credited when nothing says: the first one at the table. */
function fallbackSeats(state: WorldState): SeatId[] {
  return [state.time.connected[0] ?? 0];
}

function addSeat(out: SeatId[], s: SeatId): void {
  if (!out.includes(s)) out.push(s);
}

/** Built buildings that make the good: a trade's business, a building's own method, a master's trade. */
function makerIds(state: WorldState, goodId: string): number[] {
  const masterOf = content.masters.find((m) => m.good === goodId)?.of;
  const out: number[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    if (b.trade) {
      if (
        content.tradeById.get(b.trade)?.makes === goodId ||
        (masterOf !== undefined && b.trade === masterOf)
      )
        out.push(b.id);
      continue;
    }
    const def = content.buildingById.get(b.def);
    if (def?.methods?.some((m) => m.outputs.some(([o]) => o === goodId)) || b.def === masterOf)
      out.push(b.id);
  }
  return out;
}

class Closing {
  changed = false;
  readonly found = new Set<string>();
  readonly names = new Set<string>();

  constructor(
    readonly state: WorldState,
    readonly ctx: TickCtx,
  ) {
    for (const p of state.townBook.pages) {
      this.found.add(`${p.def}|${p.place}`);
      if (p.kind === 'custom') this.found.add(p.def);
      this.names.add(p.name);
    }
  }

  /** The specialty or custom def has a page already (a specialty is asked per place). */
  has(def: string, place?: string): boolean {
    return this.found.has(place === undefined ? def : `${def}|${place}`);
  }

  /** Writes the page: the book, the renown, the Chronicle line and the letter. */
  add(page: Omit<TownBookPage, 'id' | 'day'>): void {
    const { state, ctx } = this;
    const full: TownBookPage = { ...page, id: state.nextId++, day: dayIndex(state.tick) };
    state.townBook.pages.push(full);
    this.found.add(`${full.def}|${full.place}`);
    if (full.kind === 'custom') this.found.add(full.def);
    this.names.add(full.name);
    this.changed = true;
    addRenown(state, ctx, TOWN_BOOK.pageRenown, 'townBook');
    const row = state.places.find((r) => r.id === full.place);
    const where = row ? (row.custom ?? row.name) : townBookPhrases.anyPlace;
    const text = pageText(state, full);
    chronicle(state, ctx, 'town-book-page', {
      text: [
        ['page', full.name],
        ['place', where],
        ['text', text],
        ['credit', creditText(state, ctx, full.seats)],
      ],
      refs: [full.id],
      seats: [...full.seats],
    });
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: fillText(townBookPhrases.page, [
        ['page', full.name],
        ['place', where],
        ['text', text],
      ]),
    });
  }
}

/** Specialties found at this row (a site of the pattern whose good drew enough evenings this season). */
function findSpecialties(c: Closing, row: PlaceState, season: number): void {
  const { state } = c;
  const gev = row.goodEvenings;
  if (!gev || gev.season !== season || !row.id.startsWith('site:')) return;
  if (!gev.n.some((n) => n >= TOWN_BOOK.specialtyEvenings)) return;
  for (const def of content.specialties) {
    if (!row.id.startsWith(`site:${def.pattern}:`) || c.has(def.id, row.id)) continue;
    const g = content.goodIndex.get(def.good);
    if (g === undefined || (gev.n[g] ?? 0) < TOWN_BOOK.specialtyEvenings) continue;
    const place = placeById(state, row.id);
    if (!place) continue;
    const goodName = content.goods[g]!.name;
    const placeSeats = placeCredit(state, place);
    const tradeSeats = buildingCredit(state, makerIds(state, def.good));
    // Made Together: some seat laid the place and some other seat set up the trade.
    const together = placeSeats.some((a) => tradeSeats.some((b) => a !== b));
    const seats: SeatId[] = [];
    for (const s of placeSeats) addSeat(seats, s);
    for (const s of tradeSeats) addSeat(seats, s);
    seats.sort((a, b) => a - b);
    c.add({
      kind: 'specialty',
      def: def.id,
      place: row.id,
      good: g,
      name: specialtyName(state, def.name, goodName, place, row, c.names),
      // One seat unless the place and the trade were laid by different seats: pages with two seats are the together ones.
      seats: together ? seats : seats.length > 0 ? [seats[0]!] : fallbackSeats(state),
      leaning: def.leaning,
    });
  }
}

/** The seats a custom's page is credited to: whoever laid the place. */
function customSeats(state: WorldState, row: PlaceState): SeatId[] {
  const seats = [...placeCredit(state, placeById(state, row.id))].sort((a, b) => a - b);
  return seats.length > 0 ? seats : fallbackSeats(state);
}

/** Does the row's place fit a day custom (its pattern, its host building, or any place)? */
function dayPlaceFits(state: WorldState, row: PlaceState, def: { pattern?: string; host?: string }): boolean {
  if (def.pattern !== undefined) return row.id.startsWith(`site:${def.pattern}:`);
  if (def.host !== undefined) {
    if (!row.id.startsWith('host:')) return false;
    const id = Number(row.id.slice('host:'.length));
    return findById(state.buildings, id)?.def === def.host;
  }
  return true;
}

/** Customs found at this row: a day kept three seasons running, or a supply kept a whole season. */
function findCustoms(c: Closing, row: PlaceState, season: number, d: number): void {
  const { state } = c;
  const run = row.dayRuns?.[d] ?? 0;
  const sup = row.supplied;
  const supplyOk = sup !== undefined && sup.season >= season - 1;
  if (run < TOWN_BOOK.customSeasons && !supplyOk) return;
  for (const def of content.customs) {
    if (c.has(def.id)) continue;
    let dayOfSeason: number;
    if (def.kind === 'day') {
      if (run < TOWN_BOOK.customSeasons || !dayPlaceFits(state, row, def)) continue;
      dayOfSeason = d + 1;
    } else {
      // Supply customs fall on the first day of each season: the season opens with them.
      const k = SUPPLY_KINDS.indexOf(def.supply!);
      if (!supplyOk || k < 0 || (sup.kept[k] ?? 0) < DAYS_PER_SEASON || (sup.rested[k] ?? 0) !== 0) continue;
      dayOfSeason = 1;
    }
    if (!placeById(state, row.id)) continue;
    c.add({
      kind: 'custom',
      def: def.id,
      place: row.id,
      dayOfSeason,
      name: def.name,
      seats: customSeats(state, row),
      leaning: def.leaning,
    });
  }
}

/** Keeps `TOWN_BOOK.hints` hints visible (still possible, not found), revealing in HINT_ORDER. */
function refillHints(state: WorldState): boolean {
  const book = state.townBook;
  const found = new Set(book.pages.map((p) => p.def));
  const before = book.hints.join('|');
  const next = book.hints.filter((id) => !found.has(id) && defPossible(state, id));
  for (const id of HINT_ORDER) {
    if (next.length >= TOWN_BOOK.hints) break;
    if (found.has(id) || next.includes(id) || !defPossible(state, id)) continue;
    next.push(id);
  }
  if (next.join('|') === before) return false;
  book.hints.splice(0, book.hints.length, ...next);
  return true;
}

/** Earns the callings whose leaning has `pagesForCalling` pages (each once, in the order earned). */
function earnCallings(state: WorldState, ctx: TickCtx): boolean {
  let earned = false;
  for (const leaning of LEANINGS) {
    const pages = state.townBook.pages.filter((p) => p.leaning === leaning);
    if (pages.length < TOWN_BOOK.pagesForCalling) continue;
    const def = content.callings.find((x) => x.leaning === leaning);
    if (!def || state.townBook.callings.includes(def.id)) continue;
    state.townBook.callings.push(def.id);
    state.calling ??= def.id;
    earned = true;
    const piece = content.decorById.get(def.signature);
    if (piece && !state.hearth.unlocked.includes(piece.id)) state.hearth.unlocked.push(piece.id);
    const seats: SeatId[] = [];
    for (const p of pages) for (const s of p.seats) addSeat(seats, s);
    seats.sort((a, b) => a - b);
    chronicle(state, ctx, 'calling', {
      text: [
        ['calling', def.name],
        ['credit', creditText(state, ctx, seats)],
      ],
      seats,
    });
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: fillText(callingPhrases.earned, [
        ['town', state.settings.townName],
        ['calling', def.name],
        ['signature', (piece?.name ?? def.signature).toLowerCase()],
        ['leaning', leaning],
      ]),
    });
    if (def.lanternCharm && markLanterns(state)) markCharmSoon(state);
    ctx.events.push({ e: 'charter.updated', c: charterView(state) });
    ctx.events.push({ e: 'town.updated', t: townView(state) });
  }
  return earned;
}

/** The evening's close: counts, pages, hints, callings. */
export function closeTownBook(state: WorldState, ctx: TickCtx): void {
  const today = dayIndex(state.tick);
  const season = Math.floor(today / DAYS_PER_SEASON);
  const d = seasonAt(state.tick).day - 1;
  const tonight = state.evenings.tonight;
  const weather = tonight.day === today ? tonight.weather : 'fair';
  const c = new Closing(state, ctx);

  for (const row of state.places) {
    // Customers become evenings of this season.
    if (row.customers) {
      let gev = row.goodEvenings;
      if (!gev || gev.season !== season) {
        gev = { season, n: new Array<number>(content.goods.length).fill(0) };
        row.goodEvenings = gev;
      }
      for (let g = 0; g < row.customers.length; g++)
        if (row.customers[g]! >= TOWN_BOOK.specialtyCustomers) gev.n[g] = (gev.n[g] ?? 0) + 1;
      delete row.customers;
    }
    // Visitors become a run of the same day: lost to weather, the run holds; a fair thin day ends it.
    const visitors = row.visitors[row.visitors.length - 1] ?? 0;
    if (visitors >= TOWN_BOOK.customVisitors) {
      const runs = (row.dayRuns ??= new Array<number>(DAYS_PER_SEASON).fill(0));
      runs[d] = (runs[d] ?? 0) + 1;
    } else if (weather === 'fair' && row.dayRuns) {
      row.dayRuns[d] = 0;
    }
    findSpecialties(c, row, season);
    findCustoms(c, row, season, d);
  }

  const hints = refillHints(state);
  const callings = earnCallings(state, ctx);
  if (c.changed || hints || callings) ctx.events.push({ e: 'townBook.updated', t: townBookView(state) });
}
