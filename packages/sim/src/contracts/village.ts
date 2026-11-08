// I2 state contracts (C4.0): market and money, levers, loans, lots, trade, carts, the Charter,
// innovations, plans, requests and stories. docs/spec/20-architecture.md, "I2 contracts", and
// docs/build/i2-wave-notes.md for who owns what at runtime.
// Additive changes only during the I2 wave. Per-good values are arrays indexed by good index
// (content.goods order, append-only); content ids are strings, never object keys.
import type { Command } from './commands';
import type { MoveState } from './hamlet';
import type { EntityId, Rot4, SeatId } from './ids';

/** Town ranks, in order (RANKS in constants). */
export type RankId = 'hamlet' | 'village' | 'town' | 'marketTown' | 'city';

// --- Market and money --------------------------------------------------------------------------

/** Daily market state (docs/spec/13-ledger.md, Market and prices). Owned by C4A. */
export interface MarketState {
  /** Price per good in pennies. Starts at the good's base price. */
  prices: number[];
  /** Units households wanted yesterday, per good (D in the price rule). */
  demand: number[];
  /** Units wanted so far today; rolls into `demand` at the daily price pass. */
  demandToday: number[];
  /** Cover in hundredths of a day per good (100 * S / max(1, D)), as of the last price pass. */
  cover: number[];
  /** Price per good at each day's pass, last PRICE_HISTORY_DAYS days, oldest first. */
  history: number[][];
}

/** The Ledger's levers (docs/spec/13-ledger.md, Levers and policies). Commands set them. */
export interface LeversState {
  /** Wage level in percent, 80 to 120. */
  wageLevel: number;
  /** Income tax in percent of wages, 0 to 20. */
  taxRate: number;
  /** Price cap per good in pennies, 0 = none (foods). */
  priceCaps: number[];
  /** Subsidy per good in percent of the price the treasury pays, 0 to 50 (foods). */
  subsidies: number[];
  /** Goods the Trading Post may not sell. */
  exportBans: boolean[];
  // I3 (C5.0, C5B), absent until set, so I2 valleys save and hash as before.
  /** Weekly market day (day of the season 1 to 6), or null for none. */
  marketDay?: number | null;
  /** Workshops rest in the evening. */
  quietHours?: boolean;
}

/** A loan from the County Bank. */
export interface Loan {
  id: EntityId;
  /** Pennies borrowed. */
  principal: number;
  /** Pennies still owed (interest is added at each season's end). */
  balance: number;
  /** Interest per season, in percent. */
  rate: number;
  takenTick: number;
}

export interface LoansState {
  /** Sorted by id. */
  loans: Loan[];
}

// --- Zoning, lots and growth -------------------------------------------------------------------

/**
 * A lot: zoned frontage the subdivider cut into a footprint facing a road (docs/spec/13-ledger.md,
 * Zoning and growth). Owned by C4B. The `lot` map layer stores each tile's lot id.
 */
export interface Lot {
  id: EntityId;
  /** The `zone` layer value it was cut from. */
  zone: number;
  /** Footprint min corner and size along the world x and z axes (already turned by `rot`). */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Which way the entrance faces (toward `frontage`). */
  rot: Rot4;
  /** The road tile in front of the entrance (tile index z * size + x). */
  frontage: number;
  /** 0 to 100, refreshed by the daily growth pass. */
  desirability: number;
  /** District style id for grown buildings (C4B picks, C4E draws), '' until set. */
  style: string;
  /** The building grown on it, or 0 while empty. */
  buildingId: EntityId;
  /** Tick it was cut. */
  tick: number;
}

// --- Trade -------------------------------------------------------------------------------------

/** A neighbor's running price state (docs/spec/13-ledger.md, Trade). Owned by C4A. */
export interface NeighborState {
  id: string;
  /** Per good, permille: deterministic random walk, up to 2% a day, bounded 700 to 1400. */
  drift: number[];
  /** Per good, permille: your sales push it down, purchases up, recovering 10% a day. 1000 = none. */
  impact: number[];
}

/** Keep stock of a good between min and max through the Trading Post. */
export interface StandingOrder {
  good: number;
  /** Buy below this stock if the price is at most `ceiling`. */
  min: number;
  /** Sell above this stock if the price is at least `floor`. */
  max: number;
  /** Pennies per unit; 0 = any. */
  floor: number;
  ceiling: number;
  /** Neighbor id, or '' for the best price. */
  neighbor: string;
}

export interface Caravan {
  id: EntityId;
  neighbor: string;
  /** Goods out to sell and back to deliver: [good, qty]. */
  selling: [good: number, qty: number][];
  buying: [good: number, qty: number][];
  departTick: number;
  returnTick: number;
}

export interface TradeLogEntry {
  tick: number;
  neighbor: string;
  good: number;
  /** Positive bought, negative sold. */
  qty: number;
  /** Pennies paid (bought, negative) or received (sold, positive). */
  pennies: number;
}

export interface TradeState {
  /** One per content neighbor, in content order. */
  neighbors: NeighborState[];
  /** Sorted by good. */
  orders: StandingOrder[];
  /** Sorted by id. */
  caravans: Caravan[];
  /** Last TRADE_LOG_MAX entries, oldest first. */
  log: TradeLogEntry[];
}

// --- Carts -------------------------------------------------------------------------------------

/**
 * A cart (docs/spec/13-ledger.md, Logistics). Ids come from state.nextId, so agent frames can
 * carry carts next to residents. C4C assigns trips (job), C4B moves them on lanes and streets.
 */
export interface Cart {
  id: EntityId;
  def: string;
  /** The cart shed it belongs to. */
  home: EntityId;
  /** Current tile index; meaningful while out. */
  tile: number;
  move: MoveState | null;
  /** Carried goods [good, qty]. */
  load: [good: number, qty: number][];
  /** Porter-style job id (logistics.jobs) or 0 when idle. */
  job: number;
  /** Heading 0 to 3 for drawing (last step's direction). */
  dir: number;
  /** In the shed (not drawn). */
  parked: boolean;
}

// --- Progression -------------------------------------------------------------------------------

export interface RankUp {
  rank: RankId;
  tick: number;
  /** Seats connected at the claim. */
  seats: SeatId[];
}

/** The Charter board (docs/spec/15-progression.md, Ranks and Charters). Owned by C4D. */
export interface CharterState {
  rank: RankId;
  /** Content id of the Charter being worked toward, '' when none is left. */
  charter: string;
  /** Progress per goal in the Charter's goal order (the counted value, not capped). */
  progress: number[];
  /** Every goal is met and the claim is open. */
  ready: boolean;
  history: RankUp[];
}

export interface InnovationState {
  id: string;
  /** 0 to 100 for the notebook's bar. */
  progress: number;
  /** A running counter the measure keeps (days in a row, units per day...). */
  counter: number;
  /** Tick it unlocked, or -1 while locked. */
  unlockedTick: number;
}

// --- Plans and requests ------------------------------------------------------------------------

/** One proposed command in a plan, drawn as an ink-blue ghost (docs/spec/16-coop.md, Plans layer). */
export interface PlanItem {
  cmd: Command;
}

export interface PlanComment {
  by: SeatId;
  tick: number;
  /** Max MAX_COMMENT_CHARS. */
  text: string;
}

export interface Plan {
  id: EntityId;
  name: string;
  by: SeatId;
  tick: number;
  items: PlanItem[];
  comments: PlanComment[];
  /** Seats that have opened it. */
  seenBy: SeatId[];
  status: 'open' | 'approved' | 'discarded';
  /** After approval: commands applied and skipped (invalid or unaffordable by then). */
  applied?: number;
  skipped?: number;
}

/** What a request asks for (docs/spec/16-coop.md, Requests). */
export type RequestAsk =
  | { kind: 'goods'; good: string; qty: number; byDay: number; at: EntityId }
  | { kind: 'charm'; x: number; z: number; radius: number; target: number }
  | { kind: 'text'; text: string };

export interface SeatRequest {
  id: EntityId;
  from: SeatId;
  ask: RequestAsk;
  tick: number;
  status: 'open' | 'done' | 'withdrawn';
  /** Tick it was done or withdrawn, else 0. */
  closedTick: number;
}

// --- Stories -----------------------------------------------------------------------------------

/** A story arc's progress (docs/spec/11-residents.md, Story characters). Owned by C4D. */
export interface StoryState {
  arc: string;
  /** The character once arrived, else 0. */
  residentId: EntityId;
  /** -1 before arrival; 0 to steps-1 while a step is open; steps.length once the finale is done. */
  step: number;
  /** Tick the current step opened. */
  stepTick: number;
}

// --- Lives -------------------------------------------------------------------------------------

/** Apprenticeship at a workshop for a season (docs/spec/11-residents.md, Ages and life events). */
export interface Apprenticeship {
  at: EntityId;
  /** The trade: the workshop's def id. */
  trade: string;
  untilDay: number;
}

/** Town counters added in I2 (charter, Together achievements, letters). */
export interface VillageStats {
  requestsFulfilled: number;
  plansApproved: number;
  couples: number;
  weddings: number;
  births: number;
  /** Residents who moved to the seaside. */
  seaside: number;
}
