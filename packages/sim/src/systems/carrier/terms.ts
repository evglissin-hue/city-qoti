// The carrier's terms and prices (docs/spec/13-ledger.md, The carrier and trade). What it carries a
// day and the percent of a neighbor's regional price it pays and takes, by what stands in the valley:
//
// |                    | Carried a day                                         | Buys at | Sells at |
// | The peddler        | 20 units (PEDDLER_TERMS)                              | 140%    | 60%      |
// | With a Trading Post| 40 at Village rank, 120 at Town, 240 at Market Town,  | 120%    | 85%      |
// |                    | 400 at City, and 16 more for each cart (up to three)  |         |          |
// | The boat           | 120 units every 3 days from a River Dock (Millhaven)  | 110%    | 92%      |
//
// A deal the season plan took (`seasonPlan.deal`, one of this season's `carrier.offers`) replaces the
// cart's percent for its neighbor and family on its side. Renown's `trade` effect improves every
// price. Each unit moves the neighbor's price (nudge), so a flood of timber cheapens timber; the
// trade log keeps the last TRADE_LOG_MAX deals.
import { content } from '@qoti/content';
import { PEDDLER_TERMS, RANKS, TRADE_BUY_PERCENT, TRADE_LOG_MAX, TRADE_SELL_PERCENT } from '../../constants';
import type { Building, DealOffer, NeighborState, WorldState } from '../../contracts';
import { familyOf } from '../../state/zones';
import { regionalPrice } from '../../view/village';
import { defOf } from '../logistics/stores';
import { renownEffect } from '../renown/api';

/** Units the Trading Post's carrier carries a day by rank, in RANKS order (a Hamlet has no post). */
export const POST_UNITS_BY_RANK = [40, 40, 120, 240, 400] as const;
/** Units each cart adds to the post's load, and the carts that count. */
export const POST_CART_UNITS = 16;
export const POST_CARTS_MAX = 3;
/** Units the Trading Post carries at Village rank (kept for the views and older tests). */
export const POST_UNITS = POST_UNITS_BY_RANK[1];
/** Impact never pushes a price below half or above double. */
export const IMPACT_RANGE = [500, 2000] as const;

/** The boat (a River Dock): the neighbor it reaches, units a call, days between calls, its percents. */
export {
  BOAT_DAYS,
  BOAT_UNITS,
  DOCK_BUY_PERCENT as BOAT_BUY_PERCENT,
  DOCK_NEIGHBOR as BOAT_NEIGHBOR,
  DOCK_SELL_PERCENT as BOAT_SELL_PERCENT,
} from '../dock';

/** The built Trading Post, or null. The first by id when there are several. */
export function tradingPost(state: WorldState): Building | null {
  for (const b of state.buildings) {
    if (b.stage === 'built' && b.rt && defOf(b)?.tags?.includes('trading-post')) return b;
  }
  return null;
}

export interface CarrierTerms {
  /** Units it may carry today, in and out together. */
  units: number;
  /** Percent of the regional price it pays a neighbor (buying) and is paid (selling). */
  buy: number;
  sell: number;
}

/** Today's cart terms: the peddler's, or the Trading Post's by rank and carts once one stands. */
export function carrierTerms(state: WorldState): CarrierTerms {
  return termsFor(state, !!tradingPost(state));
}

/** The cart's terms with or without a Trading Post standing (the visit finds the post itself). */
export function termsFor(state: WorldState, post: boolean): CarrierTerms {
  if (!post) return { units: PEDDLER_TERMS.units, buy: PEDDLER_TERMS.buy, sell: PEDDLER_TERMS.sell };
  const rank = Math.max(0, RANKS.indexOf(state.charter.rank));
  const units = POST_UNITS_BY_RANK[rank]! + POST_CART_UNITS * Math.min(POST_CARTS_MAX, state.carts.length);
  return { units, buy: TRADE_BUY_PERCENT, sell: TRADE_SELL_PERCENT };
}

/** True when the neighbor trades with the valley at its rank. */
export function neighborTrades(state: WorldState, id: string): boolean {
  const def = content.neighborById.get(id);
  return !!def && (!def.rank || RANKS.indexOf(state.charter.rank) >= RANKS.indexOf(def.rank));
}

/** The deal the season plan took, when it is one of this season's offers; else null. */
export function activeDeal(state: WorldState): DealOffer | null {
  const id = state.seasonPlan.deal;
  if (!id) return null;
  return state.carrier.offers.find((o) => o.id === id) ?? null;
}

/** The cart's percent for a neighbor, good and side today: the deal's when it covers them. */
export function cartPercent(
  state: WorldState,
  neighbor: string,
  good: number,
  selling: boolean,
  terms: CarrierTerms = carrierTerms(state),
  deal: DealOffer | null = activeDeal(state),
): number {
  if (deal && deal.neighbor === neighbor && deal.side === (selling ? 'sell' : 'buy')) {
    if (deal.family === familyOf(good)) return deal.percent;
  }
  return selling ? terms.sell : terms.buy;
}

/** What the carrier pays a neighbor per unit of a good it sells, pennies; null when it does not. */
export function carrierBuyPrice(
  state: WorldState,
  neighbor: string,
  good: number,
  percent: number = cartPercent(state, neighbor, good, false),
): number | null {
  const id = content.goods[good]?.id;
  if (!content.neighborById.get(neighbor)?.sells.some(([g]) => g === id)) return null;
  const p = regionalPrice(state, neighbor, good);
  return p === null
    ? null
    : Math.max(1, Math.round((p * percent * (100 - renownEffect(state, 'trade'))) / 10000));
}

/** What a neighbor pays the carrier per unit of a good it buys, pennies; null when it does not. */
export function carrierSellPrice(
  state: WorldState,
  neighbor: string,
  good: number,
  percent: number = cartPercent(state, neighbor, good, true),
): number | null {
  const id = content.goods[good]?.id;
  if (!content.neighborById.get(neighbor)?.buys.some(([g]) => g === id)) return null;
  const p = regionalPrice(state, neighbor, good);
  return p === null ? null : Math.round((p * percent * (100 + renownEffect(state, 'trade'))) / 10000);
}

/** The neighbor with the best cart price today for a good (cheapest to buy from, best paying to sell to). */
export function bestNeighbor(
  state: WorldState,
  good: number,
  selling: boolean,
  terms: CarrierTerms = carrierTerms(state),
  deal: DealOffer | null = activeDeal(state),
): { n: NeighborState; price: number } | null {
  let best: { n: NeighborState; price: number } | null = null;
  for (const n of state.trade.neighbors) {
    if (!neighborTrades(state, n.id)) continue;
    const pct = cartPercent(state, n.id, good, selling, terms, deal);
    const p = selling ? carrierSellPrice(state, n.id, good, pct) : carrierBuyPrice(state, n.id, good, pct);
    if (p === null) continue;
    if (!best || (selling ? p > best.price : p < best.price)) best = { n, price: p };
  }
  return best;
}

/** True when some neighbor trading with the valley sells the good (so the carrier can bring it). */
export function someoneSells(state: WorldState, good: number): boolean {
  const id = content.goods[good]?.id;
  for (const n of content.neighbors) {
    if (neighborTrades(state, n.id) && n.sells.some(([g]) => g === id)) return true;
  }
  return false;
}

/** Moves a neighbor's price for a good by `by` per mille of impact, within IMPACT_RANGE. */
export function nudge(n: NeighborState, good: number, by: number): void {
  n.impact[good] = Math.max(IMPACT_RANGE[0], Math.min(IMPACT_RANGE[1], (n.impact[good] ?? 1000) + by));
}

/** Appends a deal to the trade log: qty positive bought, negative sold; pennies the other way. */
export function logTrade(
  state: WorldState,
  neighbor: string,
  good: number,
  qty: number,
  pennies: number,
): void {
  const l = state.trade.log;
  l.push({ tick: state.tick, neighbor, good, qty, pennies });
  if (l.length > TRADE_LOG_MAX) l.splice(0, l.length - TRADE_LOG_MAX);
}
