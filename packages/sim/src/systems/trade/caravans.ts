// Caravans and standing orders (docs/spec/13-ledger.md, Trade). Daily at 08:00 (CARAVAN_HOUR),
// with a Trading Post built: caravans due home unload what they bought, then the standing orders
// are read: shortfalls first, then surpluses, best-paying first. A good above its order's max is
// sold, unit by unit, to the neighbor paying most (or the one named), while the price holds at the
// floor; a good below its min (with what is already on the road counted) is bought from the
// neighbor asking least while the price stays under the ceiling and the treasury within its
// credit line. Each unit moves that
// neighbor's price by IMPACT_PER_UNIT per mille, so a flood of planks cheapens planks.
// Money settles at the gate as the caravan leaves (exports and imports, through book()); bought
// goods arrive when it comes home, the neighbor's `days` later. The day's loads share the post's
// capacity: CARAVAN_UNITS, plus a cart's worth for each cart in the valley (carts from C4C).
import { content } from '@qoti/content';
import {
  CARAVAN_HOUR,
  IMPACT_PER_UNIT,
  MAP_SIZE,
  RANKS,
  TICKS_PER_DAY,
  TRADE_BUY_PERCENT,
  TRADE_LOG_MAX,
  TRADE_SELL_PERCENT,
} from '../../constants';
import type {
  Building,
  Caravan,
  NeighborState,
  StandingOrder,
  System,
  TickCtx,
  WorldState,
} from '../../contracts';
import { goodsArray, isStandard } from '../../state/hamlet';
import { townStock } from '../../view/hamlet';
import { regionalPrice, tradeView } from '../../view/village';
import { book } from '../economy/api';
import { coinsText } from '../economy';
import { emitMoney } from '../economy/emit';
import { dailyOffset } from '../economy/time';
import { overdraftLimit } from '../loans/credit';
import { loadCaravan, tradableStock, tradingPost, unloadCaravan } from './post';

/** Units the post's caravans carry a day without carts. */
export const CARAVAN_UNITS = 40;
/** Units each cart adds, up to CARAVAN_CARTS carts. */
export const CARAVAN_CART_UNITS = 16;
export const CARAVAN_CARTS = 3;
/** Impact never pushes a price below half or above double. */
export const IMPACT_RANGE = [500, 2000] as const;

export const CARAVAN_OFFSET = dailyOffset(CARAVAN_HOUR);

/** Units the day's caravans may carry, out and back together. */
export function caravanCapacity(state: WorldState): number {
  return CARAVAN_UNITS + CARAVAN_CART_UNITS * Math.min(CARAVAN_CARTS, state.carts.length);
}

function trades(state: WorldState, id: string): boolean {
  const def = content.neighborById.get(id);
  return !!def && (!def.rank || RANKS.indexOf(state.charter.rank) >= RANKS.indexOf(def.rank));
}

/** What the post pays per unit for a good a neighbor buys, pennies; null when it does not. */
export function postSellPrice(state: WorldState, neighbor: string, good: number): number | null {
  const id = content.goods[good]?.id;
  if (!content.neighborById.get(neighbor)?.buys.some(([g]) => g === id)) return null;
  const p = regionalPrice(state, neighbor, good);
  return p === null ? null : Math.round((p * TRADE_SELL_PERCENT) / 100);
}

/** What the post charges per unit for a good a neighbor sells, pennies; null when it does not. */
export function postBuyPrice(state: WorldState, neighbor: string, good: number): number | null {
  const id = content.goods[good]?.id;
  if (!content.neighborById.get(neighbor)?.sells.some(([g]) => g === id)) return null;
  const p = regionalPrice(state, neighbor, good);
  return p === null ? null : Math.round((p * TRADE_BUY_PERCENT) / 100);
}

/** The neighbor to deal with for an order: the one named, else the best price today. */
function partner(state: WorldState, o: StandingOrder, selling: boolean): NeighborState | null {
  let best: NeighborState | null = null;
  let bestPrice = 0;
  for (const n of state.trade.neighbors) {
    if (o.neighbor && n.id !== o.neighbor) continue;
    if (!trades(state, n.id)) continue;
    const p = selling ? postSellPrice(state, n.id, o.good) : postBuyPrice(state, n.id, o.good);
    if (p === null) continue;
    if (!best || (selling ? p > bestPrice : p < bestPrice)) {
      best = n;
      bestPrice = p;
    }
  }
  return best;
}

function nudge(n: NeighborState, good: number, by: number): void {
  n.impact[good] = Math.max(IMPACT_RANGE[0], Math.min(IMPACT_RANGE[1], (n.impact[good] ?? 1000) + by));
}

function log(state: WorldState, neighbor: string, good: number, qty: number, pennies: number): void {
  const l = state.trade.log;
  l.push({ tick: state.tick, neighbor, good, qty, pennies });
  if (l.length > TRADE_LOG_MAX) l.splice(0, l.length - TRADE_LOG_MAX);
}

interface Outbound {
  neighbor: string;
  selling: [number, number][];
  buying: [number, number][];
}

function outboundFor(list: Outbound[], neighbor: string): Outbound {
  let o = list.find((x) => x.neighbor === neighbor);
  if (!o) {
    o = { neighbor, selling: [], buying: [] };
    list.push(o);
  }
  return o;
}

/** Sells up to `units` of an order's good. Returns [units, pennies]. */
function sellFor(
  state: WorldState,
  post: Building,
  o: StandingOrder,
  units: number,
): [number, number, string] {
  const n = partner(state, o, true);
  if (!n || units <= 0) return [0, 0, ''];
  let sold = 0;
  let pennies = 0;
  while (sold < units) {
    const p = postSellPrice(state, n.id, o.good)!;
    if (o.floor > 0 && p < o.floor) break;
    pennies += p;
    sold++;
    nudge(n, o.good, -IMPACT_PER_UNIT);
  }
  if (sold > 0) loadCaravan(state, post, o.good, sold);
  return [sold, pennies, n.id];
}

/** Buys up to `units` of an order's good within the ceiling and credit. Returns [units, pennies]. */
function buyFor(state: WorldState, o: StandingOrder, units: number): [number, number, string] {
  const n = partner(state, o, false);
  if (!n || units <= 0) return [0, 0, ''];
  const floor = -overdraftLimit(state);
  let bought = 0;
  let pennies = 0;
  while (bought < units) {
    const p = postBuyPrice(state, n.id, o.good)!;
    if (o.ceiling > 0 && p > o.ceiling) break;
    if (state.economy.treasury - pennies - p < floor) break;
    pennies += p;
    bought++;
    nudge(n, o.good, IMPACT_PER_UNIT);
  }
  return [bought, pennies, n.id];
}

/** Caravans due home unload. */
function homecoming(state: WorldState, post: Building | null): void {
  const due = state.trade.caravans.filter((c) => c.returnTick <= state.tick);
  if (due.length === 0) return;
  for (const c of due) {
    if (post) for (const [g, q] of c.buying) unloadCaravan(state, post, g, q);
  }
  state.trade.caravans = state.trade.caravans.filter((c) => c.returnTick > state.tick);
}

/** The best price a neighbor pays today for an order's good, or 0 when none buys it. */
function bestSellPrice(state: WorldState, o: StandingOrder): number {
  const n = partner(state, o, true);
  return n ? (postSellPrice(state, n.id, o.good) ?? 0) : 0;
}

/**
 * The day's standing orders: what sold and bought, per neighbor. Shortfalls come first (they are
 * needs), then surpluses, best-paying first, so the wagons fill with what earns most.
 */
export function runOrders(state: WorldState, post: Building): Outbound[] {
  const out: Outbound[] = [];
  if (state.trade.orders.length === 0) return out;
  const stock = townStock(state);
  const inbound = goodsArray();
  for (const c of state.trade.caravans) for (const [g, q] of c.buying) inbound[g]! += q;
  let room = caravanCapacity(state);
  const sells: [order: StandingOrder, price: number][] = [];
  for (const o of state.trade.orders) {
    const have = stock[o.good] ?? 0;
    if (have > o.max) {
      if (!state.levers.exportBans[o.good]) sells.push([o, bestSellPrice(state, o)]);
      continue;
    }
    if (room <= 0 || have + inbound[o.good]! >= o.min) continue;
    const units = Math.min(o.min - have - inbound[o.good]!, room);
    const [bought, pennies, who] = buyFor(state, o, units);
    if (bought > 0) {
      book(state, 'imports', pennies);
      log(state, who, o.good, bought, -pennies);
      outboundFor(out, who).buying.push([o.good, bought]);
      room -= bought;
    }
  }
  sells.sort((a, b) => b[1] - a[1] || a[0].good - b[0].good);
  for (const [o] of sells) {
    if (room <= 0) break;
    const units = Math.min((stock[o.good] ?? 0) - o.max, room, tradableStock(state, post, o.good));
    const [sold, pennies, who] = sellFor(state, post, o, units);
    if (sold > 0) {
      book(state, 'exports', pennies);
      log(state, who, o.good, -sold, pennies);
      outboundFor(out, who).selling.push([o.good, sold]);
      room -= sold;
    }
  }
  return out;
}

function goodsText(list: readonly [number, number][]): string {
  const parts = list.map(([g, q]) => `${q} ${content.goods[g]?.label ?? ''}`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The 08:00 pass: homecomings, then today's caravans. */
export function caravanDay(state: WorldState, ctx: TickCtx): void {
  const post = tradingPost(state);
  const before = state.trade.caravans.length;
  homecoming(state, post);
  let changed = state.trade.caravans.length !== before;
  if (post) {
    const external = state.economy.external;
    const lines: string[] = [];
    for (const o of runOrders(state, post)) {
      const def = content.neighborById.get(o.neighbor)!;
      const c: Caravan = {
        id: state.nextId++,
        neighbor: o.neighbor,
        selling: o.selling,
        buying: o.buying,
        departTick: state.tick,
        returnTick: state.tick + def.days * TICKS_PER_DAY,
      };
      state.trade.caravans.push(c);
      changed = true;
      const parts: string[] = [];
      if (c.selling.length) parts.push(`${goodsText(c.selling)} to sell`);
      if (c.buying.length) parts.push(`an order for ${goodsText(c.buying)}`);
      lines.push(
        `A caravan rolled out for ${def.name} with ${parts.join(' and ')}, back in ${def.days} days.`,
      );
    }
    const net = state.economy.external - external;
    if (net > 0) lines.push(`The strongbox is ${coinsText(net)} heavier for it.`);
    if (net < 0) lines.push(`The orders cost ${coinsText(-net)}, which the Ledger calls an investment.`);
    if (lines.length > 0) {
      const [gx, gz] = state.meta.valleyGate;
      ctx.events.push({
        e: 'notify',
        kind: 'caravan',
        text: lines.join(' '),
        at: [Math.min(MAP_SIZE - 1, gx), Math.min(MAP_SIZE - 1, gz)],
      });
    }
    if (net !== 0) emitMoney(state, ctx);
  }
  if (changed) ctx.events.push({ e: 'trade.updated', t: tradeView(state) });
}

export const caravans: System = {
  id: 'caravans',
  order: 65,
  every: TICKS_PER_DAY,
  offset: CARAVAN_OFFSET,
  tick(state, ctx) {
    if (isStandard(state)) caravanDay(state, ctx);
  },
};
