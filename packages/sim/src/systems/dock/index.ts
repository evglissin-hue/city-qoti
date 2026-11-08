// The River Dock (C5B; docs/spec/13-ledger.md, Trade). Daily at 08:00, after the caravans: with a
// River Dock built and the river open, boats due home unload, and when no boat is away one sets off
// downstream for Millhaven with what the dock's own standing orders call for (state.dock.orders;
// trade.setStandingOrder with `via: 'dock'`). Boats carry more than the caravans (BOAT_UNITS) and
// on better terms (sell at DOCK_SELL_PERCENT and buy at DOCK_BUY_PERCENT of the regional price,
// against the post's 85 and 120, plus renown's `trade` percent), but go only to Millhaven and take
// BOAT_DAYS there and back. While the river is frozen no boat sails, and one caught downstream
// waits for the thaw. Money settles as the boat leaves, with book('dock'); bought goods come home
// with it. Each unit nudges Millhaven's price like a caravan's.
import { content } from '@qoti/content';
import { IMPACT_PER_UNIT, MAP_SIZE, TICKS_PER_DAY, TRADE_LOG_MAX } from '../../constants';
import type { Boat, Building, StandingOrder, System, TickCtx, WorldState } from '../../contracts';
import { goodsArray, isStandard } from '../../state/hamlet';
import { townStock } from '../../view/hamlet';
import { dockView } from '../../view/seasons';
import { regionalPrice } from '../../view/village';
import { chronicle } from '../chronicle/api';
import { book } from '../economy/api';
import { emitMoney } from '../economy/emit';
import { coinsText } from '../economy';
import { dailyOffset } from '../economy/time';
import { overdraftLimit } from '../loans/credit';
import { defOf, isStorehouse } from '../logistics/stores';
import { doorTile } from '../movement/api';
import { renownEffect } from '../renown/api';
import { isFrozen } from '../seasons/api';
import { loadCaravan, unloadCaravan } from '../trade/post';

/** The neighbor downstream, the only one boats reach. */
export const DOCK_NEIGHBOR = 'millhaven';
/** Units a boat carries, out and back together (the post's caravans carry 40). */
export const BOAT_UNITS = 120;
/** Days a boat takes there and back. */
export const BOAT_DAYS = 3;
/** Percent of the regional price the dock gets selling and pays buying. */
export const DOCK_SELL_PERCENT = 92;
export const DOCK_BUY_PERCENT = 110;
const IMPACT_RANGE = [500, 2000] as const;

/** The built River Dock, or null (the first by id). */
export function riverDock(state: WorldState): Building | null {
  for (const b of state.buildings) if (b.stage === 'built' && b.rt && b.def === 'river-dock') return b;
  return null;
}

function trades(good: number, side: 'buys' | 'sells'): boolean {
  const id = content.goods[good]?.id;
  return !!content.neighborById.get(DOCK_NEIGHBOR)?.[side].some(([g]) => g === id);
}

/** What the dock is paid per unit of a good Millhaven buys, pennies; null when it does not. */
export function dockSellPrice(state: WorldState, good: number): number | null {
  if (!trades(good, 'buys')) return null;
  const p = regionalPrice(state, DOCK_NEIGHBOR, good);
  return p === null
    ? null
    : Math.round((p * DOCK_SELL_PERCENT * (100 + renownEffect(state, 'trade'))) / 10000);
}

/** What the dock pays per unit of a good Millhaven sells, pennies; null when it does not. */
export function dockBuyPrice(state: WorldState, good: number): number | null {
  if (!trades(good, 'sells')) return null;
  const p = regionalPrice(state, DOCK_NEIGHBOR, good);
  return p === null
    ? null
    : Math.round((p * DOCK_BUY_PERCENT * (100 - renownEffect(state, 'trade'))) / 10000);
}

function nudge(state: WorldState, good: number, by: number): void {
  const n = state.trade.neighbors.find((x) => x.id === DOCK_NEIGHBOR);
  if (!n) return;
  n.impact[good] = Math.max(IMPACT_RANGE[0], Math.min(IMPACT_RANGE[1], (n.impact[good] ?? 1000) + by));
}

function log(state: WorldState, good: number, qty: number, pennies: number): void {
  const l = state.dock.log;
  l.push({ tick: state.tick, neighbor: DOCK_NEIGHBOR, good, qty, pennies });
  if (l.length > TRADE_LOG_MAX) l.splice(0, l.length - TRADE_LOG_MAX);
}

/** Units of a good the boat can load: the dock's store, then the storehouses (as post.ts loads). */
function loadable(state: WorldState, dock: Building, good: number): number {
  let n = 0;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !b.rt || (b !== dock && !isStorehouse(defOf(b)))) continue;
    n += Math.max(0, b.rt.store[good]! - b.rt.reservedOut[good]!);
  }
  return n;
}

/** Runs the dock's orders: buys first (needs), then sells best-paying first. */
export function runDockOrders(
  state: WorldState,
  dock: Building,
): { selling: [number, number][]; buying: [number, number][] } {
  const orders: readonly StandingOrder[] = state.dock.orders ?? [];
  const selling: [number, number][] = [];
  const buying: [number, number][] = [];
  if (orders.length === 0) return { selling, buying };
  const stock = townStock(state);
  const inbound = goodsArray();
  for (const b of state.dock.boats) for (const [g, q] of b.buying) inbound[g]! += q;
  let room = BOAT_UNITS;
  const credit = -overdraftLimit(state);
  const sells: [StandingOrder, number][] = [];
  for (const o of orders) {
    const have = stock[o.good] ?? 0;
    if (have > o.max) {
      if (!state.levers.exportBans[o.good]) sells.push([o, dockSellPrice(state, o.good) ?? 0]);
      continue;
    }
    if (room <= 0 || have + inbound[o.good]! >= o.min || dockBuyPrice(state, o.good) === null) continue;
    const want = Math.min(o.min - have - inbound[o.good]!, room);
    let n = 0;
    let pennies = 0;
    while (n < want) {
      const p = dockBuyPrice(state, o.good)!;
      if (o.ceiling > 0 && p > o.ceiling) break;
      if (state.economy.treasury - pennies - p < credit) break;
      pennies += p;
      n++;
      nudge(state, o.good, IMPACT_PER_UNIT);
    }
    if (n > 0) {
      book(state, 'dock', -pennies);
      log(state, o.good, n, -pennies);
      buying.push([o.good, n]);
      room -= n;
    }
  }
  sells.sort((a, b) => b[1] - a[1] || a[0].good - b[0].good);
  for (const [o, price] of sells) {
    if (room <= 0 || price <= 0) break;
    const want = Math.min((stock[o.good] ?? 0) - o.max, room, loadable(state, dock, o.good));
    let n = 0;
    let pennies = 0;
    while (n < want) {
      const p = dockSellPrice(state, o.good)!;
      if (o.floor > 0 && p < o.floor) break;
      pennies += p;
      n++;
      nudge(state, o.good, -IMPACT_PER_UNIT);
    }
    if (n > 0) {
      loadCaravan(state, dock, o.good, n);
      book(state, 'dock', pennies);
      log(state, o.good, -n, pennies);
      selling.push([o.good, n]);
      room -= n;
    }
  }
  return { selling, buying };
}

/** The 08:00 pass. */
export function dockDay(state: WorldState, ctx: TickCtx): void {
  const dock = riverDock(state);
  const frozen = isFrozen(state);
  let changed = false;
  // Boats due home unload, unless the ice holds them downstream.
  if (!frozen) {
    const due = state.dock.boats.filter((b) => b.arriveTick <= state.tick);
    for (const b of due) {
      if (dock) for (const [g, q] of b.buying) unloadCaravan(state, dock, g, q);
    }
    if (due.length > 0) {
      state.dock.boats = state.dock.boats.filter((b) => b.arriveTick > state.tick);
      changed = true;
    }
  }
  if (dock && !frozen && state.dock.boats.length === 0) {
    const external = state.economy.external;
    const first = state.dock.log.length === 0;
    const { selling, buying } = runDockOrders(state, dock);
    if (selling.length > 0 || buying.length > 0) {
      const def = defOf(dock);
      const boat: Boat = {
        id: state.nextId++,
        neighbor: DOCK_NEIGHBOR,
        selling,
        buying,
        departTick: state.tick,
        arriveTick: state.tick + BOAT_DAYS * TICKS_PER_DAY,
        tile: -1,
      };
      state.dock.boats.push(boat);
      changed = true;
      const door = doorTile(dock, def);
      const net = state.economy.external - external;
      const units = selling.reduce((n, [, q]) => n + q, 0) + buying.reduce((n, [, q]) => n + q, 0);
      ctx.events.push({
        e: 'notify',
        kind: 'caravan',
        text: `A boat pushed off downstream for Millhaven with ${units} units of business, back in ${BOAT_DAYS} days.${net > 0 ? ` ${coinsText(net)} to the good.` : ''}`,
        at: [door % MAP_SIZE, Math.floor(door / MAP_SIZE)],
      });
      if (first) chronicle(state, ctx, 'first-boat', { text: [['neighbor', 'Millhaven']] });
      if (net !== 0) emitMoney(state, ctx);
    }
  }
  if (changed) ctx.events.push({ e: 'dock.updated', d: dockView(state) });
}

export const dock: System = {
  id: 'dock',
  order: 68,
  every: TICKS_PER_DAY,
  offset: dailyOffset(8, 2),
  tick(state, ctx) {
    if (isStandard(state)) dockDay(state, ctx);
  },
};
