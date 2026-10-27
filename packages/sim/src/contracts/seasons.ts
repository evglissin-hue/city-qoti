// I3 state contracts (C5.0): seasons and weather, warmth, festivals, renown, commissions, the River
// Dock, nature and the Field Guide, threats, the Watch, raids and trials; plus the first days guide
// (C5H). docs/spec/20-architecture.md, "I3 contracts", and docs/build/i3-wave-notes.md for who owns
// what at runtime. Additive changes only during the I3 wave. Per-good values are arrays (or
// [good, qty] pairs) by good index; content ids are strings, never object keys. Nobody is ever
// hurt (P3, P35): there is no state for injuries or destroyed homes, only goods, condition, mood
// and morale, all recoverable.
import type { MoveState } from './hamlet';
import type { EntityId, Rect, SeatId } from './ids';
import type { TradeLogEntry } from './village';

/** Season index: 0 spring, 1 summer, 2 autumn, 3 winter (SEASON_IDS in constants). */
export type SeasonIndex = 0 | 1 | 2 | 3;

// --- Weather (C5A) -----------------------------------------------------------------------------

/** Daily weather kinds (content.weather ids). */
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'heat';

export interface WeatherDay {
  /** Absolute day index (0 = Spring day 1, year 1). */
  day: number;
  kind: WeatherKind;
}

/** A weather event (content.events id: flood, drought, early-frost, cold-snap, circus). */
export interface WeatherEvent {
  id: EntityId;
  event: string;
  /** Tick it starts and the tick it ends (exclusive). */
  start: number;
  end: number;
  /** Tick it was first forecast (the barometer and the season card show it from then). */
  forecastTick: number;
}

export interface WeatherState {
  /** Today's weather. */
  today: WeatherKind;
  /** The next days, up to WEATHER_FORECAST_DAYS (2), nearest first. */
  forecast: WeatherDay[];
  /** Scheduled and running events, sorted by start then id. */
  events: WeatherEvent[];
  river: {
    frozen: boolean;
    /** Tick it froze, or -1 while open. */
    frozenTick: number;
  };
}

// --- Warmth (C5A) ------------------------------------------------------------------------------

/** A household's winter (Household.warmth). Absent outside winter and in valleys before I3. */
export interface HouseholdWarmth {
  /** Firewood burned today (units). */
  burnedToday: number;
  /** Hours cold so far today. */
  coldHours: number;
  /** Days cold this winter. */
  coldDays: number;
}

/** The town's warmth counters, for the winter trial and the Warm Hearths achievement. */
export interface WarmthStats {
  /** Year index of the winter being counted (0 = year 1), -1 before the first. */
  winter: number;
  /** Household-days cold this winter. */
  coldHouseholdDays: number;
  /** Households cold for a whole day this winter (sorted ids). */
  coldHouseholds: EntityId[];
}

// --- Festivals, renown, commissions and the River Dock (C5B) -----------------------------------

/** Where a festival is held: a rect of open ground (6x6 or more) or a pattern site. */
export type FestivalSite = { rect: Rect } | { pattern: string; anchor: number };

export interface FestivalPlan {
  /** Content festival id (one per season). */
  festival: string;
  season: SeasonIndex;
  /** Year index (0 = year 1). */
  year: number;
  site: FestivalSite | null;
  /** Up to FESTIVAL_MENU_MAX goods: [good index, qty] wanted, and what is reserved so far. */
  menu: [good: number, qty: number][];
  reserved: [good: number, qty: number][];
  /** Content twist id, '' for none. */
  twist: string;
  /** 'none', a resident musician (`musician`) or a bandstand. */
  music: 'none' | 'resident' | 'bandstand';
  musician: EntityId;
  /** Seat that last changed the plan, and when. */
  by: SeatId;
  tick: number;
}

export interface FestivalOutcome {
  attendance: number;
  /** Joy parts, each 0 to 100 (12-hearth.md, Festivals). */
  joy: { site: number; variety: number; menu: number; music: number; twist: number };
  /** 1 to 5. */
  stars: number;
}

export interface FestivalRecord {
  season: SeasonIndex;
  year: number;
  festival: string;
  stars: number;
  twist: string;
}

export interface FestivalState {
  /** This season's plan, or null before anyone plans it. */
  plan: FestivalPlan | null;
  /** Temporary festival pieces placed for it (decor ids, sorted). */
  pieces: EntityId[];
  /** True from 18:00 to 22:00 on the festival day. */
  live: boolean;
  /** The last festival's outcome, until the next one starts. */
  outcome: FestivalOutcome | null;
  /** Last FESTIVAL_HISTORY_MAX festivals, oldest first. */
  history: FestivalRecord[];
}

export interface RenownEntry {
  tick: number;
  /** What earned it: 'festival', 'raid', 'pattern', 'story', 'send-off', 'commission'. */
  source: string;
  points: number;
}

export interface RenownState {
  points: number;
  /** 0 to 5 (content.renown thresholds). */
  level: number;
  /** Last RENOWN_LOG_MAX entries, oldest first. */
  log: RenownEntry[];
}

export interface Commission {
  id: EntityId;
  /** Content commission id. */
  def: string;
  /** Who asks: a neighbor id or a visitor name. */
  from: string;
  status: 'offered' | 'accepted' | 'done' | 'declined' | 'expired';
  offeredTick: number;
  /** Tick it must be done by (from acceptance); 0 while offered. */
  deadlineTick: number;
  /** 0 to 100. */
  progress: number;
}

export interface CommissionsState {
  /** Offered, accepted and recently closed, sorted by id. */
  list: Commission[];
}

/** A boat at or bound for the River Dock (an entity from nextId, like caravans). */
export interface Boat {
  id: EntityId;
  /** Neighbor id it trades for. */
  neighbor: string;
  selling: [good: number, qty: number][];
  buying: [good: number, qty: number][];
  arriveTick: number;
  departTick: number;
  /** Tile it moors at (the dock's water edge), -1 while away. */
  tile: number;
}

export interface DockState {
  /** Sorted by id. */
  boats: Boat[];
  /** Last TRADE_LOG_MAX entries, oldest first. */
  log: TradeLogEntry[];
}

// --- Nature and the Field Guide (C5C) ----------------------------------------------------------

/** The six habitats, in HABITAT_IDS order (12-hearth.md, Nature). */
export type HabitatId = 'pollinator' | 'wetland' | 'hedgerow' | 'woodland' | 'meadow' | 'garden';

export interface FieldGuideEntry {
  /** Content wildlife id. */
  species: string;
  firstTick: number;
  /** Seats that were connected at the first sighting. */
  seats: SeatId[];
  /** Sightings so far. */
  count: number;
}

export interface NatureState {
  /**
   * Habitat scores 0 to 255, HABITAT_IDS.length x CHUNKS (6 x 144): habitat h of chunk c at
   * h * CHUNKS + c. A plain array so it saves and hashes as JSON like the other slices.
   */
  habitats: number[];
  /** Sorted by species id. */
  guide: FieldGuideEntry[];
  /** Up to 3 species ids whose hints the Field Guide shows. */
  hints: string[];
  /** Summer pests per farm: [building id, permille of yield lost], sorted by id. */
  pests: [farm: EntityId, permille: number][];
}

// --- Threats, the Watch, raids and trials (C5D, C5A) -------------------------------------------

export type RaidBand = 'small' | 'medium' | 'large';
/** The map edge a raid comes from. */
export type RaidSide = 'n' | 'e' | 's' | 'w';

export interface ScheduledRaid {
  season: SeasonIndex;
  year: number;
  /** Day of the season (1 to 6) it comes, at dusk. */
  day: number;
  side: RaidSide;
  band: RaidBand;
  /** Raiders it will bring. */
  strength: number;
  /** Tick the signs appear (two days before, three with a watchtower, less in fog). */
  telegraphTick: number;
  /** Sign ids shown so far: 'tracks', 'crows', 'letter'. */
  signs: string[];
}

export interface RaidRecord {
  tick: number;
  band: RaidBand;
  side: RaidSide;
  /** Units taken and not recovered. */
  stolen: number;
  captured: number;
  repelled: boolean;
}

export interface ThreatState {
  /** Pressure in permille of the raid threshold (1000 = a raid is due next season). */
  pressure: number;
  /** Today's deterrence parts, permille each: walls, towers, lanterns, the Watch. */
  deterrence: { walls: number; towers: number; lanterns: number; watch: number };
  scheduled: ScheduledRaid | null;
  /** Absolute day indexes of this winter's wolf nights (howling the evening before). */
  wolves: number[];
  /** Last RAID_HISTORY_MAX raids, oldest first. */
  history: RaidRecord[];
}

export interface WatchState {
  /** Volunteers, sorted by id. */
  members: EntityId[];
  /** The Ledger's target size. */
  target: number;
  /** 100 to 160 (strength factor in percent). */
  training: number;
  /** 0 to 100. */
  morale: number;
  /** Up to 3 guard tiles (tile indexes). */
  posture: number[];
  /** Members on duty today, sorted by id. */
  duty: EntityId[];
  /** Pennies a day for training and gear. */
  budget: number;
}

export interface Raider {
  id: EntityId;
  tile: number;
  move: MoveState | null;
  /** 0 to 10. */
  morale: number;
  load: [good: number, qty: number][];
  state: 'approach' | 'loot' | 'flee' | 'captured' | 'gone';
  /** Building it is heading for, 0 when none. */
  target: EntityId;
}

export interface WatchInRaid {
  resident: EntityId;
  state: 'guard' | 'intercept' | 'shaken' | 'home';
  /** 0 to 10. */
  morale: number;
}

export interface LiveRaid {
  id: EntityId;
  startTick: number;
  side: RaidSide;
  band: RaidBand;
  /** Sorted by id. */
  raiders: Raider[];
  /** Sorted by resident id. */
  watch: WatchInRaid[];
  bell: boolean;
  lanterns: boolean;
  /** Captured raiders waiting for bandit.decide (raider ids, sorted). */
  captures: EntityId[];
}

export interface TrialState {
  kind: 'winter' | 'raid' | 'flood';
  /** The Charter it seals. */
  charter: string;
  season: SeasonIndex;
  year: number;
  status: 'upcoming' | 'running' | 'passed' | 'failed';
  /** What it measured so far, as [name, value] pairs. */
  measured: [name: string, value: number][];
}

// --- The first days guide (C5H) ----------------------------------------------------------------

export interface GuideState {
  /** Index of the open step in the content guide; steps.length once done. */
  step: number;
  /** Tick each finished step was done, in step order. */
  doneTicks: number[];
  /** Per seat: the seat hid the guide (guide.setHidden). Indexed by seat. */
  hidden: boolean[];
  /** Finished, timed out (day 6) or never shown (migrated valleys, sandbox, settings.guide off). */
  over: boolean;
}

// --- Town counters (I3) ------------------------------------------------------------------------

/** Town counters added in I3 (achievements, the Charter trial, together moments). */
export interface SeasonsStats {
  /** Raids repelled with nothing stolen (The Gate Held). */
  raidsHeld: number;
  /** Winters where nobody was cold (Warm Hearths). */
  warmWinters: number;
  /** Best festival stars so far (Five Stars). */
  bestStars: number;
  /** Together moments that happened, by kind: [kind, count], sorted by kind. */
  together: [kind: string, count: number][];
}
