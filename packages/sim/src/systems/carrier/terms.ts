// The carrier's terms and prices (docs/spec/13-ledger.md, The carrier and trade). What the cart
// carries a day and the percent of a neighbor's regional price it pays and takes: the peddler's
// terms (PEDDLER_TERMS) until a Trading Post stands, the post's better ones after. Renown's `trade`
// effect improves both. Each unit moves the neighbor's price (nudge), so a flood of timber cheapens
// timber; the trade log keeps the last TRADE_LOG_MAX deals. Moved here from the caravans (R1.0).
import { content } from '@qoti/content';
import {
  PEDDLER_TERMS,
  RANKS,
  TRADE_BUY_PERCENT,
  TRADE_LOG_MAX,
  TRADE_SELL_PERCENT,
} from '../../constants';
import type { Building, NeighborState, WorldState } from '../../contracts';
import { regionalPrice } from '../../view/village';
import { defOf } from '../logistics/stores';
import { renownEffect } from '../renown/api';

/** Units the carrier carries a day once a Trading Post stands (buying and selling together). */
export const POST_UNITS = 40;
/** Impact never pushes a price below half or above double. */
export const IMPACT_RANGE = [500, 2000] as const;

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

/** Today's terms: the peddler's, or the Trading Post's once one stands. */
export function carrierTerms(state: WorldState): CarrierTerms {
  return tradingPost(state)
    ? { units: POST_UNITS, buy: TRADE_BUY_PERCENT, sell: TRADE_SELL_PERCENT }
    : { units: PEDDLER_TERMS.units, buy: PEDDLER_TERMS.buy, sell: PEDDLER_TERMS.sell };
}

/** True when the neighbor trades with the valley at its rank. */
export function neighborTrades(state: WorldState, id: string): boolean {
  const def = content.neighborById.get(id);
  return !!def && (!def.rank || RANKS.indexOf(state.charter.rank) >= RANKS.indexOf(def.rank));
}

/** What the carrier pays a neighbor per unit of a good it sells, pennies; null when it does not. */
export function carrierBuyPrice(
  state: WorldState,
  neighbor: string,
  good: number,
  percent: number = carrierTerms(state).buy,
): number | null {
  const id = content.goods[good]?.id;
  if (!content.neighborById.get(neighbor)?.sells.some(([g]) => g === id)) return null;
  const p = regionalPrice(state, neighbor, good);
  return p === null ? null : Math.round((p * percent * (100 - renownEffect(state, 'trade'))) / 10000);
}

/** What a neighbor pays the carrier per unit of a good it buys, pennies; null when it does not. */
export function carrierSellPrice(
  state: WorldState,
  neighbor: string,
  good: number,
  percent: number = carrierTerms(state).sell,
): number | null {
  const id = content.goods[good]?.id;
  if (!content.neighborById.get(neighbor)?.buys.some(([g]) => g === id)) return null;
  const p = regionalPrice(state, neighbor, good);
  return p === null ? null : Math.round((p * percent * (100 + renownEffect(state, 'trade'))) / 10000);
}

/** The neighbor with the best price today for a good (cheapest to buy from, best paying to sell to). */
export function bestNeighbor(
  state: WorldState,
  good: number,
  selling: boolean,
): { n: NeighborState; price: number } | null {
  const terms = carrierTerms(state);
  let best: { n: NeighborState; price: number } | null = null;
  for (const n of state.trade.neighbors) {
    if (!neighborTrades(state, n.id)) continue;
    const p = selling
      ? carrierSellPrice(state, n.id, good, terms.sell)
      : carrierBuyPrice(state, n.id, good, terms.buy);
    if (p === null) continue;
    if (!best || (selling ? p > best.price : p < best.price)) best = { n, price: p };
  }
  return best;
}

/** Moves a neighbor's price for a good by `by` per mille of impact, within IMPACT_RANGE. */
export function nudge(n: NeighborState, good: number, by: number): void {
  n.impact[good] = Math.max(IMPACT_RANGE[0], Math.min(IMPACT_RANGE[1], (n.impact[good] ?? 1000) + by));
}

/** Appends a deal to the trade log: qty positive bought, negative sold; pennies the other way. */
export function logTrade(state: WorldState, neighbor: string, good: number, qty: number, pennies: number): void {
  const l = state.trade.log;
  l.push({ tick: state.tick, neighbor, good, qty, pennies });
  if (l.length > TRADE_LOG_MAX) l.splice(0, l.length - TRADE_LOG_MAX);
}
