// Neutral I2 slices (C4.0): base prices, default levers, no lots, Hamlet rank with the Village
// Charter on the board, every innovation locked, every story unstarted. New valleys and migrated
// I1 valleys both start here; sandbox valleys keep them and never touch them.
import { content } from '@qoti/content';
import { DEFAULT_TAX_RATE, DEFAULT_WAGE_LEVEL, RANKS } from '../constants';
import type {
  CharterState,
  InnovationState,
  LeversState,
  MarketState,
  RankId,
  StoryState,
  TradeState,
  VillageStats,
  WorldState,
} from '../contracts';
import { goodsArray } from './hamlet';

export function emptyMarket(): MarketState {
  return {
    prices: content.goods.map((g) => g.basePrice),
    demand: goodsArray(),
    demandToday: goodsArray(),
    cover: goodsArray(),
    history: [],
  };
}

export function defaultLevers(): LeversState {
  return {
    wageLevel: DEFAULT_WAGE_LEVEL,
    taxRate: DEFAULT_TAX_RATE,
    priceCaps: goodsArray(),
    subsidies: goodsArray(),
    exportBans: new Array<boolean>(content.goods.length).fill(false),
  };
}

export function emptyTrade(): TradeState {
  return {
    neighbors: content.neighbors.map((n) => ({
      id: n.id,
      drift: new Array<number>(content.goods.length).fill(1000),
      impact: new Array<number>(content.goods.length).fill(1000),
    })),
    orders: [],
    caravans: [],
    log: [],
  };
}

/** The Charter that leads on from `rank`, or '' at the top. */
export function charterFrom(rank: RankId): string {
  return content.charters.find((c) => c.from === rank)?.id ?? '';
}

export function startCharter(rank: RankId = 'hamlet'): CharterState {
  const charter = charterFrom(rank);
  const goals = content.charterById.get(charter)?.goals.length ?? 0;
  return { rank, charter, progress: new Array<number>(goals).fill(0), ready: false, history: [] };
}

export function lockedInnovations(): InnovationState[] {
  return content.innovations
    .map((i) => ({ id: i.id, progress: 0, counter: 0, unlockedTick: -1 }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function unstartedStories(): StoryState[] {
  return content.stories
    .map((s) => ({ arc: s.id, residentId: 0, step: -1, stepTick: 0 }))
    .sort((a, b) => (a.arc < b.arc ? -1 : a.arc > b.arc ? 1 : 0));
}

export function emptyVillageStats(): VillageStats {
  return { requestsFulfilled: 0, plansApproved: 0, couples: 0, weddings: 0, births: 0, seaside: 0 };
}

/** The I2 slices of a fresh WorldState. */
export function emptyVillageSlices(): Pick<
  WorldState,
  | 'market'
  | 'levers'
  | 'loans'
  | 'lots'
  | 'trade'
  | 'carts'
  | 'charter'
  | 'innovations'
  | 'plans'
  | 'requests'
  | 'stories'
  | 'village'
> {
  return {
    market: emptyMarket(),
    levers: defaultLevers(),
    loans: { loans: [] },
    lots: [],
    trade: emptyTrade(),
    carts: [],
    charter: startCharter(),
    innovations: lockedInnovations(),
    plans: [],
    requests: [],
    stories: unstartedStories(),
    village: emptyVillageStats(),
  };
}

/** True once the valley holds `rank` or a higher one. */
export function rankAtLeast(state: WorldState, rank: RankId): boolean {
  return RANKS.indexOf(state.charter.rank) >= RANKS.indexOf(rank);
}

/** True once the innovation is unlocked. */
export function hasInnovation(state: WorldState, id: string): boolean {
  for (const i of state.innovations) if (i.id === id) return i.unlockedTick >= 0;
  return false;
}
