// R1 contracts (R1.0): the zones-first Ledger. docs/spec/20-architecture.md, "R1 contracts", and
// docs/spec/13-ledger.md; who writes and reads what at runtime is in docs/build/r1-wave-notes.md.
// Additive changes only during the R1 wave. Per-family values are arrays indexed by GOOD_FAMILIES;
// per-good values by good index; per-bar values by DEMAND_KINDS. Content ids are strings, never keys.
import type { GoodFamily } from '@qoti/content';
import type { EntityId } from './ids';

export type { GoodFamily };

// --- The carrier -------------------------------------------------------------------------------

/**
 * The carrier's rule for a family (docs/spec/13-ledger.md, The carrier and trade): Always buys up to
 * the reserve; Essentials only what a household, an open site or a resting business would otherwise
 * go without today (never Wares or Treats themselves); Never.
 */
export type CarrierRule = 'always' | 'essentials' | 'never';

/** The Ledger's terms for one family (carrier.setRule, carrier.setReserve). */
export interface CarrierFamily {
  rule: CarrierRule;
  /**
   * Days of cover to hold (Food, Fuel, Wares, Treats), or units beyond what open sites need
   * (Materials). From Summer day 4 to the thaw the season plan's winter marks stand in for Food and Fuel.
   */
  reserve: number;
  /** Sell what is over twice the reserve (never what a festival put by, nor under a winter mark). */
  sell: boolean;
  /** The Ledger set this family's rule by hand; until then the rule follows the rank's default. */
  set?: true;
}

/** A neighbor's terms for one family this season (R1A offers them; the season plan takes one). */
export interface DealOffer {
  /** Stable within the season: `${neighbor}:${family}:${side}`. */
  id: string;
  neighbor: string;
  family: GoodFamily;
  /** The carrier buys this family from them, or sells it to them. */
  side: 'buy' | 'sell';
  /** Percent of the neighbor's regional price, for the season. */
  percent: number;
}

/** The carrier (R1A): the peddler grown up, a cart at the valley gate at 10:00 and the boat. */
export interface CarrierState {
  /** One per family, in GOOD_FAMILIES order. */
  families: CarrierFamily[];
  /** Most pennies a day it may spend on imports (carrier.setBudget). */
  budget: number;
  /** Pennies spent on imports today, against the budget. */
  spentToday: number;
  /**
   * Pennies owed on the County tab: Food and Fuel carried for households that would otherwise go
   * without while the treasury could not pay. Works as the bank's loans do; capped a resident.
   */
  tab: number;
  /** Units bought by good index, for the last CARRIER_DAYS days, oldest first (today last). */
  bought: number[][];
  /** Units sold by good index, likewise. */
  sold: number[][];
  /** This season's deal offers, in neighbor order (R1A). */
  offers: DealOffer[];
  // R1A additions, absent until used.
  /**
   * Days of cover per family in hundredths (GOOD_FAMILIES order) at each day's end, oldest first,
   * a year's worth: the Balances book's history.
   */
  history?: number[][];
  /** Day index of the boat's last call at the River Dock; absent before its first. */
  boatDay?: number;
}

// --- The season plan ---------------------------------------------------------------------------

/** The Ledger's answers on the season card (docs/spec/13-ledger.md, The season plan; season.setPlan). */
export interface SeasonPlan {
  /** Days of every family the town uses to hold by the first day of winter (8 by default). */
  reserve: number;
  /** Food and Fuel set apart, or null to follow `reserve`. */
  food: number | null;
  fuel: number | null;
  /** This season's deal: a DealOffer id, or null for none. */
  deal: string | null;
  /** Where the builders go first: a zone id (a district from I4), or null. */
  buildFirst: string | null;
}

/** What season.setPlan carries: only the answers given change. */
export type SeasonPlanInput = Partial<SeasonPlan>;

// --- Demand ------------------------------------------------------------------------------------

/** The four demand bars, in DEMAND_KINDS order (Homes, Shops, Workshops, Farmland). */
export type DemandKind = 'homes' | 'shops' | 'workshops' | 'farmland';

/** Why a bar stands where it does; the view words it (docs/spec/13-ledger.md, Demand). */
export type DemandReasonCode =
  /** Homes: households would come (the town's pull is 25+) and jobs are open. */
  | 'newcomers'
  /** Shops: households no outlet reaches (`value` of them). */
  | 'noOutlet'
  /** Shops: more than eight households an outlet. */
  | 'crowded'
  /** Workshops: `good` is short, and its raw good `from` is plentiful (or comes by carrier). */
  | 'short'
  /** Workshops: a made good no business makes yet while its raw good is made here (need 0.25). */
  | 'firstMaker'
  /** Farmland: Food under four days of cover. */
  | 'foodCover'
  /** Farmland: more than a third of `good`'s use came by carrier. */
  | 'imported'
  /** Any bar: the town needs more zoned land for it (the bar is lit). */
  | 'needsLand'
  /** Any bar: a free, suitable lot exists, so growth is on its way (the bar is quiet). */
  | 'lotWaiting'
  /**
   * R1B: Shops before Village rank, when the Shops zone is closed: a Market Stall placed by hand is
   * how to answer the bar (docs/build/cycle-r1b-land-businesses.md, design note b).
   */
  | 'marketStall';

export interface DemandReason {
  code: DemandReasonCode;
  /** The good it names, by id. */
  good?: string;
  /** The raw good behind a 'short' made good, by id. */
  from?: string;
  /** A count or amount the words use (households, days of cover in hundredths). */
  value?: number;
}

/** What the town wants grown, from the 01:00 growth pass (R1B). */
export interface DemandState {
  /** 0 to 100 per bar, in DEMAND_KINDS order. */
  bars: number[];
  /** Per bar: lit when the town needs more zoned land, quiet while a free suitable lot exists. */
  lit: boolean[];
  /** Per bar, up to three reasons, strongest first. */
  reasons: DemandReason[][];
}

// --- Businesses --------------------------------------------------------------------------------

/**
 * What a business's level and retooling read (docs/spec/13-ledger.md, Levels and Choosing a
 * trade; R1B keeps them). Days count at each day's end; "today" fields reset at midnight.
 */
export interface BusinessCounters {
  /** Days in a row meeting the next level's terms (positive) or failing this level's (negative). */
  levelDays: number;
  /** Units made and sold today (steady custom: four fifths of what it made). */
  madeToday: number;
  soldToday: number;
  /** Shops: customers served today. */
  customersToday: number;
  /** It went without its raw good at some point today (reliable inputs; the carrier's counting). */
  shortToday: boolean;
  /** Days its own good has been in surplus (it retools after six when another is short). */
  surplusDays: number;
  /** Days its site wants have not been met (it retools after three, pinned or not). */
  siteDays: number;
  /** Working days its keeper has kept it (level 3 until R3's masters). */
  keeperDays: number;
}

// --- Views -------------------------------------------------------------------------------------

export interface DemandBarView {
  kind: DemandKind;
  /** 0 to 100. */
  value: number;
  lit: boolean;
  reasons: DemandReason[];
  /** The hover text, one line per reason ("Cloth is short and wool is plentiful"). */
  why: string[];
}

/** `demand.updated`: the four bars, in DEMAND_KINDS order. */
export interface DemandView {
  bars: DemandBarView[];
}

/** A flavor of a family, as the Balances book shows it. */
export interface FlavorView {
  good: string;
  /** On a shelf in reach of some home, or in a pantry, in the last three days (variety). */
  onOffer: boolean;
  /** Made in the valley: a business or specialized building makes it. */
  made: boolean;
  /** Units in store. */
  stock: number;
}

/** One family's balance (docs/spec/13-ledger.md, Reports: Balances). */
export interface BalanceLine {
  family: GoodFamily;
  /** Units in store across the town (stores, shelves, output buffers). */
  stock: number;
  /** Units the town uses a day (yesterday's use, or the baskets' want if that is more). */
  use: number;
  /** Days of cover, in hundredths: the amount. */
  cover: number;
  /** Its flavors, in goods order: the variety. */
  flavors: FlavorView[];
  /** Pennies: the average of its flavors' prices, weighted by what was bought yesterday. */
  price: number;
  /** Units the carrier brought in and took out, today and yesterday. */
  carriedIn: number;
  carriedOut: number;
  carriedInYesterday: number;
  carriedOutYesterday: number;
  rule: CarrierRule;
  reserve: number;
  sell: boolean;
  /** The season plan's winter mark, from Summer day 4 to the thaw; else null. */
  mark: number | null;
  /** Days of cover in hundredths at each day's end, oldest first, up to a year (R1A keeps it). */
  history: number[];
}

/** `balances.updated`: the five families and the carrier's purse, for the Ledger's top bar and book. */
export interface BalancesView {
  /** In GOOD_FAMILIES order. */
  lines: BalanceLine[];
  /** Pennies: the carrier's daily budget and what it spent today. */
  budget: number;
  spentToday: number;
  /** Pennies on the County tab, and its cap. */
  tab: number;
  tabCap: number;
  /** The valley road is closed by snow today: the carrier does not come. */
  passClosed: boolean;
  plan: SeasonPlan;
  offers: DealOffer[];
}

/** `business.updated`: a business or specialized building, for the Businesses book. */
export interface BusinessView {
  id: EntityId;
  def: string;
  /** The trade, or null for a specialized building. */
  trade: string | null;
  /** 1 to 3 (specialized buildings are 1). */
  level: number;
  /** The keeper, or 0 while it has none. */
  keeperId: EntityId;
  pinned: boolean;
  /** Hands at work and the crew its level wants. */
  hands: number;
  crew: number;
  /** Its state in words ("Baking", "Resting: no grain; the carrier brings some at ten"). */
  status: string;
  /** Days toward the next level (positive) or toward sliding back (negative). */
  levelDays: number;
  /** Specialized buildings with a capacity: businesses (or homes) served in reach, and how many it may serve. */
  served?: { count: number; capacity: number };
}
