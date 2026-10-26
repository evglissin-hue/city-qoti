// Empty I1 slices and runtime helpers (C3.0). Sandbox valleys keep these slices empty.
import { content } from '@qoti/content';
import type { BuildingDef } from '@qoti/content';
import { LEDGER_CATEGORIES, TICKS_PER_HOUR } from '../constants';
import type {
  BuildingRuntime,
  EconomyState,
  HearthState,
  LedgerPeriod,
  LogisticsState,
  TownStats,
  WorldState,
} from '../contracts';

/** A zeroed per-good array (content.goods order). */
export function goodsArray(): number[] {
  return new Array<number>(content.goods.length).fill(0);
}

export function emptyPeriod(): LedgerPeriod {
  return {
    money: new Array<number>(LEDGER_CATEGORIES.length).fill(0),
    produced: goodsArray(),
    consumed: goodsArray(),
  };
}

export function emptyEconomy(): EconomyState {
  return {
    treasury: 0,
    forSale: new Array<boolean>(content.goods.length).fill(false),
    today: emptyPeriod(),
    yesterday: emptyPeriod(),
    season: emptyPeriod(),
    lastSeason: null,
    stockHistory: [],
    leanTimes: false,
    seasonsInSurplus: 0,
    everProduced: goodsArray(),
    external: 0,
  };
}

export function emptyLogistics(): LogisticsState {
  return { jobs: [], nextJobId: 1, flows: [] };
}

export function emptyHearth(): HearthState {
  return { sites: [], discovered: [], hints: [], unlocked: [], dirtyChunks: [] };
}

export function emptyStats(): TownStats {
  return {
    wishesGranted: 0,
    wishesExpired: 0,
    arrivals: 0,
    departures: 0,
    digest: [],
    builtTogether: 0,
    attractiveness: 0,
  };
}

/** The I1 slices of a fresh WorldState. */
export function emptyHamletSlices(): Pick<
  WorldState,
  | 'residents'
  | 'households'
  | 'economy'
  | 'logistics'
  | 'hearth'
  | 'wishes'
  | 'chronicle'
  | 'achievements'
  | 'stats'
  | 'networkVersion'
> {
  return {
    residents: [],
    households: [],
    economy: emptyEconomy(),
    logistics: emptyLogistics(),
    hearth: emptyHearth(),
    wishes: [],
    chronicle: [],
    achievements: [],
    stats: emptyStats(),
    networkVersion: 0,
  };
}

/**
 * Runtime for a building in a standard valley. `site` starts it as a construction site that needs
 * the def's goods and work; otherwise it starts built (the starting town, fixtures).
 */
export function createRuntime(def: BuildingDef, site: boolean): BuildingRuntime {
  let construction: BuildingRuntime['construction'] = null;
  if (site) {
    const needs = goodsArray();
    for (const [good, qty] of def.cost?.goods ?? []) {
      const i = content.goodIndex.get(good);
      if (i !== undefined) needs[i] = qty;
    }
    construction = {
      needs,
      delivered: goodsArray(),
      work: (def.work ?? 8) * TICKS_PER_HOUR,
      workDone: 0,
      priority: false,
      paid: 0,
    };
  }
  return {
    workers: [],
    present: 0,
    input: goodsArray(),
    output: goodsArray(),
    store: goodsArray(),
    reservedIn: goodsArray(),
    reservedOut: goodsArray(),
    method: 0,
    progress: 0,
    construction,
    condition: 100,
    paused: false,
    status: 0,
    producedToday: goodsArray(),
  };
}

/** True when the valley runs the I1 economy and residents. */
export function isStandard(state: WorldState): boolean {
  return state.settings.mode === 'standard';
}
