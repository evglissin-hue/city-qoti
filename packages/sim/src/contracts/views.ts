// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.
import type { HistoryItem, LifeStage, MoodBand, TierId } from './hamlet';
import type { EntityId, LayerName, Lens, Rot4, SeatId, Speed } from './ids';
import type { ValleySettings } from './settings';
import type { WorldState } from './state';

export interface BuildingView {
  id: EntityId;
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  builtBy: SeatId;
  handmade: boolean;
  stage: 'construction' | 'built';
  foundation: boolean;
  custom?: Record<string, string | boolean>;
  /** I1: runtime summary in standard valleys (sent on building.updated). */
  rt?: BuildingRuntimeView;
}

export interface DecorView {
  id: EntityId;
  def: string;
  fx: number;
  fz: number;
  rot: number;
  builtBy: SeatId;
}

export interface NoteView {
  id: EntityId;
  x: number;
  z: number;
  text: string;
  by: SeatId;
  tick: number;
}

export interface SeatView {
  seat: SeatId;
  name: string;
  color: number;
  lens: Lens;
  connected: boolean;
  desiredSpeed: Speed;
  lastSeenTick: number;
}

export interface ClockView {
  tick: number;
  /** Effective speed. */
  speed: Speed;
  year: number;
  season: 0 | 1 | 2 | 3;
  day: number;
  hour: number;
  minute: number;
}

export interface ViewSnapshot {
  simVersion: string;
  saveVersion: number;
  size: number;
  lastTurn: number;
  layers: Record<LayerName, Uint8Array | Int32Array>;
  buildings: BuildingView[];
  decor: DecorView[];
  notes: NoteView[];
  seats: SeatView[];
  settings: ValleySettings;
  clock: ClockView;
  meta: WorldState['meta'];
  // I1 (C3.0): present in every valley (empty in sandbox).
  residents?: ResidentView[];
  households?: HouseholdView[];
  stocks?: StocksView;
  budget?: BudgetView;
  wishes?: WishView[];
  patterns?: PatternView[];
  chronicle?: ChronicleEntryView[];
  achievements?: AchievementView[];
  town?: TownView;
}

// ---------------------------------------------------------------------------------------------
// I1 views (C3.0). Coarse views travel with events; full detail comes from the worker's
// `inspect` request (ResidentDetail, BuildingDetail, AwayLetter).

/** Coarse resident data: enough for the renderer (species, look) and lists. */
export interface ResidentView {
  id: EntityId;
  given: string;
  family: string;
  species: string;
  stage: LifeStage;
  traits: string[];
  householdId: EntityId;
  homeId: EntityId;
  jobId: EntityId;
  tier: TierId;
  wishId: EntityId;
  moodBand: MoodBand;
  /** 0 to 5. */
  bond: number;
  /** Look seed for fur and clothes. */
  look: number;
  /** ResidentFlags bits. */
  flags: number;
}

export interface HouseholdView {
  id: EntityId;
  family: string;
  members: EntityId[];
  homeId: EntityId;
  tier: TierId;
  /** Food units in the pantry (all food goods). */
  pantryFood: number;
}

/** Building runtime summary (I1). Goods as [good id, qty] pairs. */
export interface BuildingRuntimeView {
  jobs: number;
  workers: number;
  present: number;
  /** BuildingStatus bits. */
  status: number;
  condition: number;
  paused: boolean;
  /** 0 to 1 through the current production cycle. */
  progress: number;
  input: [good: string, qty: number][];
  output: [good: string, qty: number][];
  store: [good: string, qty: number][];
  construction?: {
    /** 0 staked, 1 foundation, 2 frame, 3 roof (see constructionStage). */
    stage: 0 | 1 | 2 | 3;
    /** 0 to 1 over materials and work together. */
    progress: number;
    needs: [good: string, qty: number][];
    delivered: [good: string, qty: number][];
    priority: boolean;
  };
}

export interface StockLine {
  good: string;
  /** Units in storehouses, stalls and output buffers. */
  stock: number;
  producedToday: number;
  consumedToday: number;
  producedYesterday: number;
  consumedYesterday: number;
  /** Stock at the end of each of the last days, oldest first (sparkline). */
  history: number[];
  forSale: boolean;
}

export interface StocksView {
  lines: StockLine[];
}

export interface BudgetView {
  /** Pennies. */
  treasury: number;
  leanTimes: boolean;
  /** [category, pennies] in LEDGER_CATEGORIES order; `kind` says income or expense. */
  today: BudgetLine[];
  yesterday: BudgetLine[];
  season: BudgetLine[];
  lastSeason: BudgetLine[] | null;
}

export interface BudgetLine {
  category: string;
  kind: 'income' | 'expense';
  pennies: number;
}

export interface WishView {
  id: EntityId;
  template: string;
  residentId: EntityId;
  /** Rendered text (name and place filled in). */
  text: string;
  lane: 'hearth' | 'ledger';
  homeId: EntityId;
  /** Soft target area to highlight, or null when the wish is not spatial. */
  area: { x: number; z: number; radius: number } | null;
  createdTick: number;
  expiresTick: number;
}

export interface PatternView {
  id: string;
  discovered: boolean;
  /** Hint visible (one of the 3 shown hints). */
  hinted: boolean;
  tick?: number;
  seat?: SeatId;
  together?: boolean;
  /** Valid site instances: anchor tile and member ids. */
  sites: { x: number; z: number; members: EntityId[]; tiles: number[] }[];
}

export interface ChronicleEntryView {
  id: EntityId;
  tick: number;
  kind: string;
  text: string;
  refs: EntityId[];
  seats: SeatId[];
}

export interface AchievementView {
  id: string;
  unlocked: boolean;
  tick?: number;
  seats?: SeatId[];
}

/** Top-bar numbers. */
export interface TownView {
  population: number;
  households: number;
  /** Pennies. */
  treasury: number;
  leanTimes: boolean;
  attractiveness: number;
  /** Unlocked content ids (Pattern Book). */
  unlocked: string[];
  wishesGranted: number;
}

/** Full resident detail for the inspector (worker `inspect`). */
export interface ResidentDetail {
  r: ResidentView;
  mood: number;
  /** [need, satisfaction 0..100] in NEED_IDS order. */
  needs: [need: string, value: number][];
  /** Mood breakdown: need contributions and modifiers, as readable lines. */
  moodLines: { label: string; value: number }[];
  friends: { id: EntityId; name: string; level: number }[];
  householdMembers: { id: EntityId; name: string }[];
  /** Readable current activity ("At work at the bakery"). */
  doing: string;
  bio: string;
  history: (HistoryItem & { text: string })[];
  wish?: WishView;
  age: { years: number; stage: LifeStage };
}

/** Full building detail for the inspector (worker `inspect`). */
export interface BuildingDetail {
  b: BuildingView;
  workers: { id: EntityId; name: string; present: boolean }[];
  /** Homes: the household living here. */
  household?: { id: EntityId; family: string; members: { id: EntityId; name: string }[] };
  /** Readable status lines ("Missing flour", "No porters in range"). */
  status: string[];
  /** Production: method name and cycle in hours. */
  method?: { name: string; hours: number };
  /** Water and food coverage: residents served and capacity. */
  served?: { residents: number; capacity: number };
}

/** The while-you-were-away letter (docs/spec/16-coop.md). */
export interface AwayLetter {
  seat: SeatId;
  since: number;
  days: number;
  entries: ChronicleEntryView[];
  /** [label, before, after]. */
  stats: [label: string, before: number, after: number][];
  notes: NoteView[];
  /** C3B: the letter's opening ("Dear Ada, you were away for three days..."), lines split by \n. */
  opening?: string;
  /** C3B: notable Chronicle entries since `since` that did not fit in `entries` (it keeps the newest). */
  more?: number;
}
