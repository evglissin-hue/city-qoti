// R3 contracts (R3.0): masters and the Town Book, with supplies and Follow the thread.
// docs/spec/19-evenings.md (Supplies, Masters, The Town Book, Data and budgets); docs/spec/20-architecture.md,
// "R3 contracts"; who writes and reads what at runtime is in docs/build/r3-wave-notes.md. Additive
// changes only during the R3 wave. Per-good quantities are arrays by good index; lists are sorted as
// each field says (ids compared with `<`, never localeCompare). Every number is in content
// (`SUPPLIES`, `MASTERY`, `TOWN_BOOK`), never here. Which pieces rest tonight, a place's warmth and
// its draw stay derived (R2's rule on `Place`): only what cannot be worked out again is saved.
import type { CustomDef, Leaning, RestKind, SupplyKind } from '@qoti/content';
import type { PlaceId } from './evenings';
import type { EntityId, SeatId } from './ids';

export type { Leaning, RestKind, SupplyKind };

// --- Supplies (R3A) ------------------------------------------------------------------------------

/** A lantern with a candle tonight: the tick the lamplighter reaches it (19-evenings.md, Supplies). */
export interface LampState {
  /** The lantern (decor id). */
  id: EntityId;
  /**
   * The absolute tick its lamp comes on, between the settling (17:30) and `SUPPLIES.litHour` (18:00):
   * when the lamplighter reaches it on his walk; `litHour` sharp in a Hamlet, or with nobody in the
   * job. For every rule (charm, the draw, raiders) a settled lantern is lit from `litHour` whatever
   * this says: the walk is there to be watched, and the rules never wait for it.
   */
  reach: number;
}

/** What a supplied piece remembers (only what cannot be derived from the map and stock). */
export interface PieceSupply {
  /** The piece (decor id). */
  id: EntityId;
  /** Nights running it rested (0 while supplied): the fourth gap and the place card read it. */
  rested: number;
  /** season kind (festival cloth): the absolute season index (year * 4 + season) its cloth went up. */
  cloth?: number;
  /** evening kind (fires): the day index it last burned (someone came and firewood was drawn). */
  burned?: number;
}

/**
 * The town's supplies (R3A), saved. Lit bits are settled once a day at the settling (17:30) for the
 * night ahead and stand until the next settling: a lantern is lit for the rules when it is listed
 * here and the hour is `litHour` to `outHour` (decorLit), so they go out at 07:00 by themselves.
 */
export interface SuppliesState {
  /** Day index of the night last settled, -1 before the first. */
  night: number;
  /** Lanterns with a candle that night, sorted by decor id. */
  lamps: LampState[];
  /** Supplied pieces' records, sorted by id; a piece absent here has never rested and keeps no cloth or fire. */
  pieces: PieceSupply[];
  /** Units places drew, by good index, for the last two nights, oldest first (the Balances book's line). */
  drawn: number[][];
  /** Residents holding the lamplighter's job, sorted; their `jobId` is the Town Hall's, and they are not among its builders. */
  lamplighters: EntityId[];
  /** Seasons from `SUPPLIES.fromRank` in which every lantern was lit every night (The Lamplighter's Round). */
  roundSeasons: number;
  /** This season (absolute index) and whether a lantern went unlit on one of its nights. */
  roundSeason: number;
  roundBroken: boolean;
}

/** A supplied piece resting tonight, as R3F draws it and the place card says it. */
export interface RestingView {
  id: EntityId;
  kind: RestKind;
}

/** A lit lantern for whoever draws it: on at `reach`, out at `out` (absolute ticks). */
export interface LampView {
  id: EntityId;
  reach: number;
  out: number;
}

/**
 * `supplies.updated` (R3A): at the settling, at `outHour`, and when a priority or a piece's rest
 * changes. R3F draws from it (lamps lighting one by one, resting pieces, candle-lit windows); the
 * place card and the Balances book read their own views.
 */
export interface SuppliesView {
  /** Day index of the night it describes. */
  night: number;
  /** Lanterns with a candle tonight, sorted by id; a lantern not listed is unlit. */
  lamps: LampView[];
  /** Supplied pieces resting tonight, sorted by id. */
  resting: RestingView[];
  /** Homes (building ids) with a candle tonight: every window lit from dusk until `candleUntil`; sorted. */
  candles: EntityId[];
  /** The absolute tick candle-lit windows go dark tonight (bedtime). */
  candleUntil: number;
  /** Lamplighter jobs the town has, and who holds them (sorted). */
  lamplighters: { jobs: number; held: EntityId[] };
}

/** One kind of supply at a place (the place card: what it wants a night, whether it had it). */
export interface PlaceSupplyView {
  kind: SupplyKind;
  /** The good it draws (nightly, evening, season). */
  good?: string;
  /** Pieces of this kind in the place. */
  pieces: number;
  /** Units it wants a night (or when put up, for cloth). */
  wants: number;
  /** Pieces of this kind resting tonight. */
  resting: number;
}

// --- Masters (R3B) -------------------------------------------------------------------------------

/** The town's masters (R3B), saved. A master is a resident with `ResidentFlags.master` and `Resident.mastery`. */
export interface MastersState {
  /** The absolute season index (year * 4 + season) each trade last made a master in, sorted by trade. */
  lastMade: [trade: string, season: number][];
  /** Masters ever made in the valley (Master of the House). */
  made: number;
}

// --- The Town Book (R3C) -------------------------------------------------------------------------

/** A page's kind: a specialty (a flavor at a place) or a custom (a habit). */
export type PageKind = 'specialty' | 'custom';

/** A page found (19-evenings.md, The Town Book). */
export interface TownBookPage {
  /** Stable id (state.nextId). */
  id: EntityId;
  kind: PageKind;
  /** The content specialty or custom id. */
  def: string;
  /** Where it was found. */
  place: PlaceId;
  /** specialty: the flavor, by good index. */
  good?: number;
  /** custom of kind `day`: the day of the season (1 to DAYS_PER_SEASON) it falls on. */
  dayOfSeason?: number;
  /** Its name in the book ("Orchard Walk Cider"), filled when found and kept. */
  name: string;
  /** Day index it was found. */
  day: number;
  /** The seats credited: both when the place and the trade were laid by different seats (Made Together). */
  seats: SeatId[];
  leaning: Leaning;
}

/** The Town Book (R3C), saved: pages found, hints, and the callings earned. */
export interface TownBookState {
  /** Pages found, sorted by id. */
  pages: TownBookPage[];
  /** Up to `TOWN_BOOK.hints` content ids (specialties or customs) not yet found, in hint order. */
  hints: string[];
  /** Callings earned, in the order earned (content calling ids). */
  callings: string[];
}

/** A page as both lenses show it. */
export interface TownBookPageView extends TownBookPage {
  /** The good's id, for a specialty. */
  goodId?: string;
  /** The place's name now (a seat's rename, else the generated one). */
  placeName: string;
  /** The page's words (content). */
  text: string;
  /** Two seats credited. */
  together: boolean;
}

/** A hint for a page not yet found. */
export interface TownBookHintView {
  def: string;
  kind: PageKind;
  hint: string;
  leaning: Leaning;
}

/** A calling the town has earned. */
export interface CallingView {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  leaning: Leaning;
  effectLines: string[];
  /** Day index it was earned (the page that earned it). */
  day: number;
}

/** `townBook.updated` (R3C): the pages, the hints, the callings and how the leanings stand. */
export interface TownBookView {
  pages: TownBookPageView[];
  hints: TownBookHintView[];
  callings: CallingView[];
  /** Pages found by leaning, in LEANINGS order. */
  leanings: number[];
}

// --- Follow the thread (R3D) ---------------------------------------------------------------------

/**
 * A pair of doors and a good (17-presentation.md, Follow the thread): units that went from `from` to
 * `to` (maker to store, store to outlet, outlet to home) or were bought there and enjoyed at `place`
 * (outlet to place; `to` is 0). A decaying count, halved at midnight like the flows overlay's.
 */
export interface ThreadPair {
  /** The door the goods left (building id). */
  from: EntityId;
  /** The building they went to, or 0 when they went to a place. */
  to: EntityId;
  /** The place they were enjoyed at, when `to` is 0. */
  place?: PlaceId;
  /** Good index. */
  good: number;
  units: number;
}

/** The door-pair counts behind Follow the thread (R3D), saved. */
export interface ThreadsState {
  /** Sorted by from, then to, then place (absent first), then good; bounded per door (R3D). */
  pairs: ThreadPair[];
}

/** What a Thread is asked about: any inspector's subject. */
export type ThreadSubject =
  | { kind: 'building'; id: EntityId; good?: string }
  | { kind: 'resident'; id: EntityId }
  | { kind: 'place'; id: PlaceId }
  | { kind: 'good'; good: string };

/** A Thread (`threadView`, the inspectors' query): one sentence across both lanes and its route. */
export interface ThreadView {
  subject: ThreadSubject;
  /** "This cider: fruit from the Hollins orchard, pressed on Mill Lane, drunk by 14 folk at the Promenade." */
  text: string;
  /** The names in the sentence a click opens, in order: `building:<id>`, a PlaceId, `resident:<id>`. */
  refs: { name: string; ref: string }[];
  /** The route's tiles, door to door in order, for the highlight while it is open. */
  route: number[];
}

/** A custom's day kind, re-exported for the readers of `customToday`. */
export type CustomKind = CustomDef['kind'];
