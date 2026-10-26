// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.
import type { HistoryItem, LifeStage, MoodBand, TierId } from './hamlet';
import type { EntityId, LayerName, Lens, Rot4, SeatId, Speed } from './ids';
import type { ValleySettings } from './settings';
import type { WorldState } from './state';
import type { PlanItem, RankId, RequestAsk } from './village';

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
  /** I2 (C4.0): grown buildings, their lot and district style. */
  lot?: EntityId;
  style?: string;
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
  // I2 (C4.0)
  market?: MarketView;
  levers?: LeversView;
  loans?: LoansView;
  lots?: LotView[];
  trade?: TradeView;
  charter?: CharterView;
  innovations?: InnovationView[];
  plans?: PlanView[];
  requests?: RequestView[];
  stories?: StoryView[];
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
  /** I2 (C4.0): their partner, so couples can walk together. */
  partner?: EntityId;
}

export interface HouseholdView {
  id: EntityId;
  family: string;
  members: EntityId[];
  homeId: EntityId;
  tier: TierId;
  /** Food units in the pantry (all food goods). */
  pantryFood: number;
  /** I2 (C4.0): pennies saved. */
  savings?: number;
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
  // I2 (C4.0)
  rank?: RankId;
  /** Charter goals met of total, and whether the claim is open. */
  charter?: { done: number; total: number; ready: boolean };
  /** Residents per tier, in TIERS order. */
  tiers?: number[];
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
  // I2 (C4.0), present when they apply.
  partner?: { id: EntityId; name: string; married: boolean };
  parents?: { id: EntityId; name: string }[];
  children?: { id: EntityId; name: string }[];
  apprenticeship?: { at: EntityId; trade: string; untilDay: number };
  retired?: boolean;
  /** Story characters: their arc and where it stands. */
  story?: StoryView;
  /** Household savings in pennies and the next tier's progress. */
  savings?: number;
  /** C4C adds `missing`: readable names of what the household still lacks for the next tier. */
  tierProgress?: { next: TierId; days: number; needed: number; missing?: string[] };
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
  /** I1 (C3C): goods per work day with the full crew, after condition and any height bonus. */
  rates?: { inputs: [good: string, perDay: number][]; outputs: [good: string, perDay: number][] };
  /** I1 (C3C): units made today. */
  producedToday?: [good: string, qty: number][];
  // I2 (C4.0)
  /** Output at market price minus wages, upkeep and inputs at market price, per work day (pennies). */
  profit?: { perDay: number; lines: { label: string; pennies: number }[] };
  /** Methods the Ledger may pin, and the pinned one. */
  methods?: { id: string; name: string }[];
  pinned?: string;
  /** Grown buildings: their lot. */
  lot?: LotView;
  /** Homes: the tier housed and an upgrade under way. */
  tier?: TierId;
  upgrade?: { to: string; waiting: [good: string, qty: number][] };
}

/** I1 (C3C): the Workforce report. Jobs per building and the town's totals. */
export interface WorkforceView {
  lines: {
    id: EntityId;
    def: string;
    role: string;
    jobs: number;
    workers: number;
    present: number;
  }[];
  jobs: number;
  employed: number;
  /** Adults and young residents without a job. */
  unemployed: number;
  vacancies: number;
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

// ---------------------------------------------------------------------------------------------
// I2 views (C4.0). Pennies throughout; goods as content ids.

export interface MarketLine {
  good: string;
  /** Today's price and the base price, pennies. */
  price: number;
  base: number;
  /** Units households wanted yesterday. */
  demand: number;
  /** Days of cover (stock / demand), one decimal. */
  cover: number;
  /** Daily prices, oldest first (up to 24 days). */
  history: number[];
  /** Price cap (0 = none) and subsidy percent. */
  cap: number;
  subsidy: number;
}

/** The Ledger's market page (prices, history, levers). */
export interface MarketView {
  lines: MarketLine[];
}

export interface LeversView {
  wageLevel: number;
  taxRate: number;
  /** Wages per day per job tier at the current level, pennies, in TIERS order. */
  wages: number[];
  exportBans: string[];
}

export interface LoansView {
  loans: { id: EntityId; principal: number; balance: number; rate: number; takenTick: number }[];
  /** Total owed and what can still be borrowed, pennies. */
  owed: number;
  available: number;
}

export interface LotView {
  id: EntityId;
  /** Zone content id. */
  zone: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: Rot4;
  desirability: number;
  style: string;
  buildingId: EntityId;
}

export interface TradeView {
  /** Neighbors trading now, with prices at the post (you buy at 1.2x, sell at 0.85x the regional price). */
  neighbors: {
    id: string;
    name: string;
    blurb: string;
    prices: { good: string; buy: number | null; sell: number | null }[];
  }[];
  orders: { good: string; min: number; max: number; floor: number; ceiling: number; neighbor: string }[];
  caravans: {
    id: EntityId;
    neighbor: string;
    selling: [good: string, qty: number][];
    buying: [good: string, qty: number][];
    departTick: number;
    returnTick: number;
  }[];
  /** Newest last. */
  log: { tick: number; neighbor: string; good: string; qty: number; pennies: number }[];
  /** The Trading Post building, or 0 when the valley has none. */
  postId: EntityId;
}

export interface CharterView {
  rank: RankId;
  /** The rank being worked toward, or null at the top. */
  next: RankId | null;
  charter: string;
  goals: {
    id: string;
    text: string;
    lane: 'hearth' | 'ledger' | 'shared';
    value: number;
    target: number;
    done: boolean;
  }[];
  ready: boolean;
  history: { rank: RankId; tick: number; seats: SeatId[] }[];
}

export interface InnovationView {
  id: string;
  name: string;
  blurb: string;
  /** 0 to 100. */
  progress: number;
  unlocked: boolean;
  tick?: number;
}

export interface PlanView {
  id: EntityId;
  name: string;
  by: SeatId;
  tick: number;
  items: PlanItem[];
  comments: { by: SeatId; tick: number; text: string }[];
  seenBy: SeatId[];
  status: 'open' | 'approved' | 'discarded';
  applied?: number;
  skipped?: number;
}

export interface RequestView {
  id: EntityId;
  from: SeatId;
  ask: RequestAsk;
  /** Readable ("12 bread at the market by Summer day 3"). */
  text: string;
  tick: number;
  status: 'open' | 'done' | 'withdrawn';
  closedTick: number;
  /** Goods and charm requests: how close they are. */
  progress?: { value: number; target: number };
}

export interface StoryView {
  arc: string;
  /** The character's full name. */
  name: string;
  species: string;
  residentId: EntityId;
  /** -1 before arrival; steps once the finale is done. */
  step: number;
  steps: number;
  /** The open step's hint, if any. */
  hint?: string;
}

/** A letter from a story character (arrival, each step, the finale). */
export interface LetterView {
  arc: string;
  from: string;
  residentId: EntityId;
  /** Lines split by \n. */
  text: string;
  tick: number;
  /** -1 hello, 0.. step letters, steps for the finale. */
  step: number;
}

export type LifeEventKind = 'couple' | 'wedding' | 'birth' | 'apprentice' | 'retired' | 'seaside';
