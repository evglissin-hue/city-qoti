// R1 (R1.0): the zones-first Ledger's slices and the helpers every R1 cycle shares. Owners: R1.0
// writes them; R1A (the carrier) and R1B (trades, levels, demand) build on them. docs/spec/13-ledger.md.
import { content, type ProductionMethod } from '@qoti/content';
import {
  BUSINESS_LEVEL_MAX,
  CARRIER_BUDGET,
  CARRIER_DAYS,
  CARRIER_DEFAULTS,
  DEMAND_KINDS,
  GOOD_FAMILIES,
  PENNIES_PER_COIN,
  WINTER_RESERVE_DAYS,
} from '../constants';
import type {
  Building,
  BusinessCounters,
  CarrierFamily,
  CarrierState,
  DemandState,
  GoodFamily,
  SeasonPlan,
  WorldState,
} from '../contracts';
import { rankAtLeast } from './village';

/** A family's index in every per-family array (GOOD_FAMILIES order). */
export function familyIndex(family: GoodFamily): number {
  return GOOD_FAMILIES.indexOf(family);
}

/** The family of a good, by good index. */
export function familyOf(good: number): GoodFamily {
  return content.goods[good]!.family;
}

/** Good indexes of each family, in GOOD_FAMILIES order (each list in goods order). */
export const GOODS_BY_FAMILY: readonly (readonly number[])[] = GOOD_FAMILIES.map((f) =>
  content.goods.flatMap((g, i) => (g.family === f ? [i] : [])),
);

/** Good indexes of the Food family: what residents eat. */
export const FOOD_GOODS: readonly number[] = GOODS_BY_FAMILY[0]!;

/** True when the good (by index) is Food, so residents eat it. */
export function isFood(good: number): boolean {
  return content.goods[good]?.family === 'food';
}

// --- The carrier -------------------------------------------------------------------------------

/** The carrier's terms for a family at a rank, as CARRIER_DEFAULTS has them. */
export function defaultCarrierFamily(family: number, village: boolean): CarrierFamily {
  const d = CARRIER_DEFAULTS[family]!;
  return { rule: village ? d.village : d.hamlet, reserve: d.reserve, sell: d.sell };
}

/** A fresh carrier: the defaults at Hamlet rank, nothing carried, nothing owed. */
export function emptyCarrier(): CarrierState {
  const n = content.goods.length;
  return {
    families: GOOD_FAMILIES.map((_, f) => defaultCarrierFamily(f, false)),
    budget: CARRIER_BUDGET * PENNIES_PER_COIN,
    spentToday: 0,
    tab: 0,
    bought: Array.from({ length: CARRIER_DAYS }, () => new Array<number>(n).fill(0)),
    sold: Array.from({ length: CARRIER_DAYS }, () => new Array<number>(n).fill(0)),
    offers: [],
  };
}

/**
 * The rank's defaults for every family the Ledger has not set by hand (Wares and Treats turn to
 * Always at Village rank). Call it when the rank changes.
 */
export function applyRankDefaults(state: WorldState): void {
  const village = rankAtLeast(state, 'village');
  state.carrier.families.forEach((f, i) => {
    if (!f.set) f.rule = defaultCarrierFamily(i, village).rule;
  });
}

// --- The season plan and demand ----------------------------------------------------------------

export function defaultSeasonPlan(): SeasonPlan {
  return { reserve: WINTER_RESERVE_DAYS, food: null, fuel: null, deal: null, buildFirst: null };
}

export function emptyDemand(): DemandState {
  return {
    bars: DEMAND_KINDS.map(() => 0),
    lit: DEMAND_KINDS.map(() => false),
    reasons: DEMAND_KINDS.map(() => []),
  };
}

/** The R1 slices of a fresh WorldState (sandbox valleys keep them as they are). */
export function emptyZonesSlices(): Pick<WorldState, 'carrier' | 'seasonPlan' | 'demand'> {
  return { carrier: emptyCarrier(), seasonPlan: defaultSeasonPlan(), demand: emptyDemand() };
}

// --- Businesses --------------------------------------------------------------------------------

export function emptyCounters(): BusinessCounters {
  return {
    levelDays: 0,
    madeToday: 0,
    soldToday: 0,
    customersToday: 0,
    shortToday: false,
    surplusDays: 0,
    siteDays: 0,
    keeperDays: 0,
  };
}

/** A business's level, 1 to BUSINESS_LEVEL_MAX (absent means 1). */
export function levelOf(b: Building): number {
  return Math.min(BUSINESS_LEVEL_MAX, Math.max(1, b.level ?? 1));
}

/**
 * The production method a building runs: its trade's for a business, else its def's (a specialized
 * building's one method). Null when it makes nothing (a shop, a windmill, a service).
 */
export function methodOf(b: Pick<Building, 'def' | 'trade'>): ProductionMethod | null {
  if (b.trade) return content.tradeById.get(b.trade)?.method ?? null;
  return content.buildingById.get(b.def)?.methods?.[0] ?? null;
}

/** Hands a building wants: a business's trade crew at its level, else its def's jobs. */
export function jobsOf(b: Pick<Building, 'def' | 'trade' | 'level'>): number {
  if (b.trade) {
    const crew = content.tradeById.get(b.trade)?.crew;
    if (crew) return crew[Math.min(BUSINESS_LEVEL_MAX, Math.max(1, b.level ?? 1)) - 1]!;
  }
  return content.buildingById.get(b.def)?.jobs?.count ?? 0;
}

/**
 * True when the building answers to `tag`: its def's id or one of its tags, or, for a business, its
 * trade id (a baker's business is a 'baker'; docs/spec/12-hearth.md, the R1 note on detectors).
 */
export function hasTag(b: Pick<Building, 'def' | 'trade'>, tag: string): boolean {
  if (b.def === tag || b.trade === tag) return true;
  return content.buildingById.get(b.def)?.tags?.includes(tag) ?? false;
}
