// R2 contracts (R2.0): the evening round. docs/spec/19-evenings.md; docs/spec/20-architecture.md,
// "R2 contracts"; who writes and reads what at runtime is in docs/build/r2-wave-notes.md.
// Additive changes only during the R2 wave. Places, gaps and streets are kept in arrays sorted by
// id (place ids are strings, compared with `<`, never localeCompare). Every tunable number is in
// content (`PLACES`, `GAPS`, `NeedsBasket.evenings`), never here.
import type { GapKind, PlaceKind } from '@qoti/content';
import type { EntityId, SeatId } from './ids';

export type { GapKind, PlaceKind };

// --- Places --------------------------------------------------------------------------------------

/** Where a place comes from (19-evenings.md, Places: Where places come from). */
export type PlaceSource = 'site' | 'seats' | 'porch' | 'host';

/**
 * A place's stable id (19-evenings.md, Data and budgets), built by the helpers in `state/places.ts`:
 * `site:<pattern>:<anchor tile>` for a pattern site, `seats:<lowest seat piece id>` for a sitting
 * spot, `porch:<home id>`, `host:<building id>` for a building host (tavern, Bath House, Market
 * Square, stall, well), `fire:<decor id>` for a bonfire or brazier, `ice:<tile>` for the skating
 * ice (its lowest tile), `festival:<anchor tile>` for the festival site on its night.
 */
export type PlaceId = string;

/** A place's draw in parts, for the place card (19-evenings.md, Places: Draw). All whole numbers. */
export interface DrawParts {
  /** The average charm over its tiles, counted up to `PLACES.charmCap`. */
  charm: number;
  /** A pattern site. */
  site: number;
  /** Kinds of piece in it, up to `PLACES.pieceKindMax`. */
  pieces: number;
  /** Water within `PLACES.waterRadius` tiles. */
  water: number;
  /** Its lanterns lit (after `PLACES.litHour`). */
  lit: number;
  /** It serves Treats: an outlet within reach has them on the shelf (a live part, see Place.draw). */
  treats: number;
  /** Winter, open air, with no fire and no ice: zero or negative. */
  winter: number;
}

/**
 * A place (derived: never saved, never hashed). R2A's place pass builds these from saved state;
 * the index is rebuilt on load and kept by the pass, so a seat joining from a snapshot sees what its
 * partner sees.
 *
 * Determinism rule (R2.0): every field is a pure function of the saved state at the moment it is
 * read. The index rebuilds when one of its inputs changes (decor, buildings, pattern sites, the charm
 * layer, the hour, the season, the ice, the festival) and caches nothing that moves between those
 * (stock): whether an outlet has Treats on its shelf is read live (`placeDraw`, `placeServes`).
 */
export interface Place {
  id: PlaceId;
  source: PlaceSource;
  /** The pattern id for a site; the host's or first piece's def id otherwise. */
  def: string;
  /** Its anchor tile: distance, the card and a gap's tag measure from here. */
  tile: number;
  /** Tiles it covers (the charm average, footfall, the card's highlight), sorted. */
  tiles: number[];
  /** Member decor and building ids, sorted (a site's members, the seat pieces, the host, the porch's home). */
  members: EntityId[];
  /** Seats from its pieces (`DecorDef.seats`), a host's `HostDef.seats`, a porch's `PLACES.porchSeats`. */
  seats: number;
  /** Seats for children only (swing, see-saw): grown-ups never take them. Counted inside `seats`. */
  childSeats: number;
  /** Standing room: pieces' and hosts' `standing`, plus `PLACES.standingShare` percent of the seats (at least `PLACES.standingMin`); a walk's strollers. */
  standing: number;
  /** Its kinds, in PLACE_KINDS order, without repeats. */
  kinds: PlaceKind[];
  /** Under a roof (tavern, Bath House, Market Hall): rain spares it. */
  sheltered: boolean;
  /** Sheltered and heated, or a fire in it: winter spares it. */
  warm: boolean;
  /** Outlets that sell Treats within `PLACES.serveRadius` tiles, sorted ids (whether they have any is read live). */
  outlets: EntityId[];
  /** The draw without its live part (Treats on a shelf), 0 to 100; `placeDraw` adds it. */
  draw: number;
  parts: DrawParts;
  /** A porch: the household whose seats they are (nobody else sits there). */
  household?: EntityId;
}

/** R3 (place.setPriority): keep first, as it comes, let it rest. Absent until R3, read as 'normal'. */
export type PlacePriority = 'keep' | 'normal' | 'rest';

/**
 * What the town remembers of a place, by its stable id (19-evenings.md, Data and budgets): saved
 * and hashed. Each per-evening array holds the last PLACE_EVENINGS evenings, oldest first; R2A
 * pushes a fresh 0 to each at 17:00 (the evening under way is the last entry, and stays the last
 * closed evening from 21:00 until the next 17:00). A place the pass no longer finds keeps its row
 * for `PLACES.forgetDays` days (a stall pulled down and put back keeps its name and its counts).
 */
export interface PlaceState {
  id: PlaceId;
  /** Generated when first found (what stands there and the nearest family) and kept. */
  name: string;
  /** A seat's name for it (place.rename); absent shows `name`. */
  custom?: string;
  /** Who renamed it. */
  renamedBy?: SeatId;
  /** R3 (place.setPriority). */
  priority?: PlacePriority;
  /** Residents who stopped there (R2A's recordVisit), by evening. */
  visitors: number[];
  /** Pennies taken from the round at the outlets serving it (R2B's recordSale), by evening. */
  takings: number[];
  /** Treats sold to the round there (units), by evening. */
  sold: number[];
  /** Outlets that served there with Treats on the shelf during the evening (0: nothing to sell), by evening. */
  served: number[];
  /** Day index it was first found. */
  firstDay: number;
  /** Day index the place pass last found it. */
  seenDay: number;
}

// --- The round -----------------------------------------------------------------------------------

/** What a stop on the round was for: a place's kind, the shop first when the pantry is low, or a friend's home. */
export type RoundStopKind = PlaceKind | 'shop' | 'visit';

/**
 * One stop of a resident's round (19-evenings.md, The round). R2A plans and fills it; R2B reads it at
 * 21:00 for the score. `flags` are RoundFlags bits (constants.ts).
 */
export interface RoundStop {
  /** A PlaceId; `shop:<building id>` for shopping first; `home:<household id>` for an evening at a friend's. */
  place: string;
  kind: RoundStopKind;
  /** The tile they make for. */
  tile: number;
  /** The place's draw as they found it on arrival (`PLACES.visitDraw` at a friend's), 0 until then. */
  draw: number;
  /** RoundFlags bits: what happened there. */
  flags: number;
  /** Tick they arrived, or -1 while it is still ahead of them. */
  arrived: number;
}

/** A resident's last evening (19-evenings.md, Good evenings); the need itself is needs[evenings]. */
export interface ResidentEvening {
  /** Last evening's score, 0 to 100 (staying in scores `PLACES.stayInScore`, every evening's floor). */
  score: number;
  /** Day index of that evening (an evening lost to weather leaves the last one standing). */
  day: number;
  /** Evenings at `PLACES.goodEvening` or more this season (four of six give a heart). */
  good: number;
  /** The absolute season index `good` counts in (year * 4 + season). */
  season: number;
  /** This season's heart was given. */
  heart?: true;
}

// --- The evening's tally ---------------------------------------------------------------------------

/** How the weather took an evening: fair, rain (one in two skip open-air places) or a storm (all stay in). */
export type EveningWeather = 'fair' | 'rain' | 'storm';

/** One evening's tally (19-evenings.md, Good evenings: the evening's tally): numbers, not a book. */
export interface EveningTally {
  /** Day index of the evening, -1 before the first. */
  day: number;
  weather: EveningWeather;
  /** Young and adult residents who planned an evening (17:00, builders and porters at 19:00). */
  grownups: number;
  /** Of them, went out to at least one place. */
  out: number;
  /** Stayed in for want of a place worth the walk in reach. */
  nowhere: number;
  /** Stood at least once for want of a seat. */
  stood: number;
  /** Sum of their scores at 21:00 (the average is scoreSum / grownups). */
  scoreSum: number;
  /** Friendships made (a pair became friends) between 17:00 and 21:00. */
  friendships: number;
  /** Treats sold at stops, to passing trade, and sent for from the doorstep at 21:30 (units). */
  treatsAtStops: number;
  treatsPassing: number;
  treatsDoorstep: number;
  /** Pennies taken from the round (stops and passing trade; Village rank on). */
  takings: number;
}

/**
 * The town's evenings (saved): the evening under way and the last few, for the edition, the Charter's
 * evening goal and the feats. R2A rolls `tonight` into `history` at 17:00 and counts who planned,
 * went, stayed in and stood; R2B scores and sells; R2C reads it at 21:00 and keeps the runs.
 */
export interface EveningsState {
  /** The evening under way, or the last one closed until the next 17:00. */
  tonight: EveningTally;
  /** The last PLACE_EVENINGS evenings before `tonight`, oldest first. */
  history: EveningTally[];
  /** Fair evenings running with at least half the grown-ups out (the Village's evening goal; R2C). */
  outRun: number;
  /** Fair evenings on which every grown-up went out (Out of an Evening; R2C). */
  allOut: number;
  /** Evenings this season with someone standing for want of a seat, and whole seasons without one (A Seat for Everyone; R2C). */
  stoodThisSeason: number;
  seatedSeasons: number;
}

// --- Gaps ----------------------------------------------------------------------------------------

/**
 * A gap (19-evenings.md, Gaps): a request the town writes itself. Deduped by (kind, subject); opens
 * from Village rank. `subject` is a PlaceId (a place with nothing to sell), `building:<id>` (a shop
 * nobody passes) or `street:<id>` (nowhere to go).
 */
export interface Gap {
  id: EntityId;
  kind: GapKind;
  subject: string;
  /** Where its paper tag stands (tile index). */
  tile: number;
  /** Day index it opened. */
  openedDay: number;
  /** The number its words quote (visitors, units sold, households), refreshed while it is open. */
  n: number;
  /** Day index it closed; absent while open. */
  closedDay?: number;
  /** The seats credited for closing it (the seat whose piece closed it; both when both laid it). */
  closers?: SeatId[];
}

/** Evenings running a gap rule has held, toward opening (no gap yet) or closing (the gap is open). */
export interface GapStreak {
  kind: GapKind;
  subject: string;
  n: number;
}

/** Open and lately closed gaps (R2C), saved. */
export interface GapsState {
  /** Open gaps, sorted by id. */
  open: Gap[];
  /** Gaps closed in the last PLACE_EVENINGS days, oldest first (the edition and the season report read them). */
  closed: Gap[];
  /** Streaks toward opening and closing, sorted by kind then subject. */
  streaks: GapStreak[];
  /** Gaps closed in all, and by each seat (indexed by SeatId): Mind the Gap, Together goals, Odette's arc. */
  closedCount: number;
  closedBySeat: number[];
  /** `kind:subject` credited this season (once a place a season), sorted; cleared when a season starts. */
  credited: string[];
}

// --- Streets -------------------------------------------------------------------------------------

/**
 * A street's name, by road run (10-world-and-building.md, Roads [R2]). R2A decides what a run is
 * (the lot cutter's frontage runs are the model) and names it once, from what stands on it; the run
 * holding `anchor` keeps the name when roads change, and a row whose run is gone is dropped.
 */
export interface Street {
  /** Stable id (state.nextId). */
  id: EntityId;
  /** A tile of its run (tile index). */
  anchor: number;
  /** Generated when first named ("Mill Lane", "Underbank Row") and kept. */
  name: string;
  /** A seat's name for it (road.rename); absent shows `name`. */
  custom?: string;
  renamedBy?: SeatId;
}

// --- Views ---------------------------------------------------------------------------------------

/** A place for the card, the Town overlay and lists (`places.updated`). */
export interface PlaceView {
  id: PlaceId;
  /** The name to show: a seat's rename, else the generated one. */
  name: string;
  /** The generated name (renaming to '' brings it back). */
  generated: string;
  renamedBy?: SeatId;
  source: PlaceSource;
  def: string;
  tile: number;
  tiles: number[];
  members: EntityId[];
  seats: number;
  childSeats: number;
  standing: number;
  kinds: PlaceKind[];
  sheltered: boolean;
  warm: boolean;
  /** Outlets serving it now: Treats within reach and on the shelf. */
  serves: EntityId[];
  /** The draw now, live part included, and its parts. */
  draw: number;
  parts: DrawParts;
  /** Visitors, takings (pennies) and Treats sold, the last PLACE_EVENINGS evenings, oldest first. */
  visitors: number[];
  takings: number[];
  sold: number[];
  /** Residents there right now (sitting or standing). */
  present: number;
  /** What it still wants, one short clause each ("a stall would sell to the 14 who come"). */
  wants: string[];
  household?: EntityId;
}

/** `places.updated`: every place, sorted by id. */
export interface PlacesView {
  places: PlaceView[];
}

/** A line of the evening edition, crediting the seats it names (17-presentation.md, The evening edition). */
export interface EditionLine {
  text: string;
  /** Seats credited by name in the line (none for an honest line about the day). */
  seats: SeatId[];
  /** What a click on it shows: PlaceIds, `building:<id>`, `gap:<id>`, `street:<id>`. */
  refs: string[];
}

/** `evening.closed` at 21:00 (R2C): the tally, three to five lines, the places by visitors. */
export interface EveningView {
  tally: EveningTally;
  /** Three to five lines across both lanes; a gap closed today leads. */
  lines: EditionLine[];
  /** Tonight's places, most visitors first. */
  places: { id: PlaceId; name: string; visitors: number; seats: number; takings: number }[];
}

/** A gap as both lenses show it (the left feed and the paper tag). */
export interface GapView {
  id: EntityId;
  kind: GapKind;
  subject: string;
  tile: number;
  /** Whose work closes it, for the feed's ink. */
  lane: 'hearth' | 'ledger';
  /** What it reads like ("The Promenade drew 14 folk and had nothing to sell them."). */
  text: string;
  /** What would close it, in words. */
  closes: string;
  openedDay: number;
  n: number;
  closedDay?: number;
  closers?: SeatId[];
}

/** `gaps.updated` (R2C). */
export interface GapsView {
  open: GapView[];
  /** Closed in the last PLACE_EVENINGS days, oldest first. */
  closed: GapView[];
  closedCount: number;
  closedBySeat: number[];
}

/** A street's name and run, for labels, the endpaper map and rename (`streets.updated`). */
export interface StreetView {
  id: EntityId;
  name: string;
  generated: string;
  renamedBy?: SeatId;
  anchor: number;
  /** The run's tiles (tile indexes), sorted. */
  tiles: number[];
}

/**
 * `footfall.updated` (R2A): copies of the two footfall layers for the Town overlay's sage ink and the
 * endpaper map, hourly from 17:00 to 21:00 and after the 04:00 halving. The layers never travel as
 * layer patches (every step would dirty a chunk).
 */
export interface FootfallView {
  day: Uint16Array;
  eve: Uint16Array;
}

/** A stop of a resident's round for the inspector's line of stops (ResidentDetail.round). */
export interface RoundStopView extends RoundStop {
  /** The place's name, the shop's, or the friend's family ("the Underbanks'"). */
  name: string;
}
