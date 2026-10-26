// I1 state contracts (C3.0): residents, households, building runtime, economy, logistics, Hearth,
// wishes, Chronicle and achievements. docs/spec/20-architecture.md, "I1 contracts".
// Additive changes only during the I1 wave. Per-good quantities are arrays indexed by good index
// (content.goods order, append-only); per-need values are arrays indexed by NEED_IDS order.
import type { EntityId, SeatId } from './ids';

/** Settlers in I1; the rest arrive in I2 to I4. */
export type TierId = 'settler' | 'craftsfolk' | 'merchant' | 'patron';
export type LifeStage = 'child' | 'young' | 'adult' | 'elder';
/** Index order of Resident.needs (see NEED_IDS in constants). */
export type NeedId = 'food' | 'water' | 'shelter' | 'belonging' | 'beauty';
/** 0 Miserable, 1 Unhappy, 2 Meh, 3 Content, 4 Glowing. */
export type MoodBand = 0 | 1 | 2 | 3 | 4;

/** What a resident is doing. C3A owns the schedule; C3C drives porters and builders through `task`. */
export type Activity =
  | { kind: 'arrive' }
  | { kind: 'home' }
  | { kind: 'sleep' }
  | { kind: 'commute'; to: EntityId }
  | { kind: 'work'; at: EntityId }
  | { kind: 'shop'; outlet: EntityId; carrying: number }
  | { kind: 'leisure'; tile: number }
  | { kind: 'visit'; friend: EntityId }
  | { kind: 'play'; tile: number }
  | { kind: 'stroll'; tile: number }
  | { kind: 'goHome' }
  | { kind: 'stuck'; since: number }
  | { kind: 'leave' }
  /** A logistics or construction task (C3C): porter trips and builder work. */
  | { kind: 'task'; taskId: number };

export type MoveReason = 'schedule' | 'task' | 'arrive' | 'leave' | 'shop' | 'leisure';

/** Path progress when walking. Tiles are indexes z * size + x. */
export interface MoveState {
  /** Remaining path including the current target tile; path[step] is the next tile. */
  path: number[];
  step: number;
  /** Progress from the current tile toward path[step], 0 to 255. */
  progress: number;
  /** Final destination tile. */
  target: number;
  reason: MoveReason;
  /** networkVersion the path was planned on. */
  version: number;
}

export interface MoodModifier {
  /** Stable kind id ('wish-granted', 'new-friend', 'lean-times'...); same-kind modifiers refresh. */
  kind: string;
  /** Mood points at the start; decays linearly to 0 at `until` (or holds while `until` is 0). */
  value: number;
  from: number;
  /** Tick it ends; 0 = held until removed. */
  until: number;
}

export interface Friend {
  id: EntityId;
  /** 0 to 5. */
  level: number;
  points: number;
  /** Day index the two last met. */
  lastMet: number;
}

export interface HistoryItem {
  day: number;
  kind: string;
  ref?: EntityId;
}

export interface Resident {
  id: EntityId;
  given: string;
  family: string;
  /** Species content id. */
  species: string;
  stage: LifeStage;
  /** Absolute day index. */
  bornDay: number;
  /** Trait content ids, 2 in I1. */
  traits: string[];
  householdId: EntityId;
  /** Workplace building, or 0. */
  jobId: EntityId;
  tier: TierId;
  /** 0 to 100. */
  mood: number;
  /** Satisfaction 0 to 100 per need, in NEED_IDS order. */
  needs: number[];
  modifiers: MoodModifier[];
  /** 0 to 5 hearts. */
  bond: number;
  /** Max 5, sorted by id. */
  friends: Friend[];
  activity: Activity;
  move: MoveState | null;
  /** Current tile index (z * size + x). Meaningful when outdoors. */
  tile: number;
  /** Building the resident is inside, or 0 when outdoors. */
  inside: EntityId;
  /** Carried goods [goodIndex, qty], or null. */
  carry: [good: number, qty: number] | null;
  wishId: EntityId;
  /** Last 20. */
  history: HistoryItem[];
  /** ResidentFlags bits. */
  flags: number;
  /** Generated seed for looks (fur, clothes); never changes. */
  look: number;
}

export interface Household {
  id: EntityId;
  family: string;
  /** Sorted by id. */
  members: EntityId[];
  homeId: EntityId;
  /** Food and other goods by good index; pantry capacity is 8 food units. */
  pantry: number[];
  /** Food good indexes eaten in the last 3 days (variety bonus), newest last. */
  recentFoods: number[];
  /** Pennies [I2]. */
  savings: number;
  tier: TierId;
  arrivedDay: number;
  /** Consecutive days with average mood below the departure threshold. */
  lowMoodDays: number;
}

/** Construction progress of a site (standard valleys). */
export interface ConstructionState {
  /** Materials still needed, by good index. */
  needs: number[];
  /** Materials delivered so far, by good index. */
  delivered: number[];
  /** Builder-ticks needed (def.work hours x TICKS_PER_HOUR). */
  work: number;
  workDone: number;
  /** Raised by build.setPriority. */
  priority: boolean;
  /** Coins paid, refunded on cancel. In pennies. */
  paid: number;
}

/** Runtime state for buildings in standard valleys. Sandbox buildings have none. */
export interface BuildingRuntime {
  /** Assigned residents, sorted by id. */
  workers: EntityId[];
  /** Workers inside right now. */
  present: number;
  /** Input buffer by good index. */
  input: number[];
  /** Output buffer by good index. */
  output: number[];
  /** Storage by good index (storehouses and market stalls). */
  store: number[];
  /** Units reserved by porters: incoming (space) and outgoing (goods), by good index. */
  reservedIn: number[];
  reservedOut: number[];
  /** Index into def.methods. */
  method: number;
  /** Work toward the current cycle, in worker-ticks. */
  progress: number;
  /** Construction state while stage is 'construction'. */
  construction: ConstructionState | null;
  /** 0 to 100 (percent). Lean times lower it; builders repair it. */
  condition: number;
  paused: boolean;
  /** BuildingStatus bits, refreshed by the owning systems. */
  status: number;
  /** Producing buildings: units produced today, by good index (reports). */
  producedToday: number[];
}

export interface PorterJob {
  id: number;
  porter: EntityId;
  from: EntityId;
  to: EntityId;
  good: number;
  qty: number;
  /** 0 walking to the source, 1 carrying to the destination. */
  stage: 0 | 1;
  /** Priority class it was matched under (lower is more urgent). */
  priority: number;
}

export interface LogisticsState {
  /** Sorted by id. */
  jobs: PorterJob[];
  nextJobId: number;
  /** Deliveries per day between building pairs, for the flows overlay: [from, to, units]. */
  flows: [from: EntityId, to: EntityId, units: number][];
}

/** One day or season of the books. Arrays are indexed by LEDGER_CATEGORIES and by good index. */
export interface LedgerPeriod {
  /** Pennies by ledger category (income positive, expenses positive too; the category says which). */
  money: number[];
  /** Units produced by good index. */
  produced: number[];
  /** Units consumed (eaten or used as inputs or construction) by good index. */
  consumed: number[];
}

export interface EconomyState {
  /** Pennies. Negative means lean times. */
  treasury: number;
  /** Goods the peddler may buy, by good index. */
  forSale: boolean[];
  today: LedgerPeriod;
  yesterday: LedgerPeriod;
  season: LedgerPeriod;
  lastSeason: LedgerPeriod | null;
  /** Town stock at each day's end, by good index, last 14 days (oldest first). */
  stockHistory: number[][];
  leanTimes: boolean;
  /** Seasons that ended with income above expenses. */
  seasonsInSurplus: number;
  /** Total units ever produced, by good index (firsts and achievements). */
  everProduced: number[];
}

export interface PatternSite {
  pattern: string;
  /** Tile index of the anchor; (pattern, anchor) is the stable instance key. */
  anchor: number;
  /** Member entity ids (decor and buildings), sorted. */
  members: EntityId[];
  /** Member tiles (road and tree tiles), sorted tile indexes. */
  tiles: number[];
  /** Seats that placed members. */
  seats: SeatId[];
  tick: number;
}

export interface DiscoveredPattern {
  pattern: string;
  tick: number;
  /** Credited seat (placed most members). */
  seat: SeatId;
  /** Both seats placed members of the discovering site. */
  together: boolean;
  anchor: number;
}

export interface HearthState {
  /** Sorted by (pattern, anchor). */
  sites: PatternSite[];
  /** In discovery order. */
  discovered: DiscoveredPattern[];
  /** Up to 3 undiscovered pattern ids whose hints are visible. */
  hints: string[];
  /** Unlocked content ids (decor, buildings). */
  unlocked: string[];
  /** Chunks waiting for a charm recompute, as chunk indexes (cz * CHUNKS_PER_SIDE + cx), sorted. */
  dirtyChunks: number[];
  /**
   * C3B: set by Hearth commands (decor, trees, customize) so the next tick recomputes the dirty
   * chunks instead of waiting for the hourly pass. Absent (never false) when nothing is due, so
   * saves from before it existed hash the same.
   */
  charmSoon?: true;
}

export interface Wish {
  id: EntityId;
  template: string;
  residentId: EntityId;
  /** Text variant picked at creation. */
  variant: number;
  /** Bound places: home and work building ids, nearest market (0 when none). */
  home: EntityId;
  work: EntityId;
  market: EntityId;
  createdTick: number;
  expiresTick: number;
}

export interface ChronicleEntry {
  id: EntityId;
  tick: number;
  kind: string;
  /** Rendered from a template at creation (deterministic). */
  text: string;
  refs: EntityId[];
  seats: SeatId[];
}

export interface AchievementState {
  id: string;
  tick: number;
  /** Seats credited (connected at the time, or the acting seat). */
  seats: SeatId[];
}

/** Town counters for achievements, the while-you-were-away letter and the Charter [I2]. */
export interface TownStats {
  wishesGranted: number;
  wishesExpired: number;
  arrivals: number;
  departures: number;
  /** Granted wishes since the last weekly digest: [residentId, template]. */
  digest: [EntityId, string][];
  /** Count of discoveries credited to both seats. */
  builtTogether: number;
  /** Attractiveness 0 to 100, recomputed each morning. */
  attractiveness: number;
}

/** What a seat saw last: kept when it disconnects, for the while-you-were-away letter. */
export interface SeenStats {
  tick: number;
  population: number;
  treasury: number;
  patterns: number;
  wishesGranted: number;
}
