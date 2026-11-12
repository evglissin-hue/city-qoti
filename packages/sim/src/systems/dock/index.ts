// The River Dock (C5B; docs/spec/13-ledger.md, The carrier and trade). From R1A the carrier sails
// the boat: every three days while the river runs, the boat from Millhaven calls with the cart at
// 10:00, carrying 120 units at 110% and 92% of the regional price (systems/carrier). It ties up for
// a few hours as a Boat in `dock.boats` for the dock view, and this 08:02 pass clears the boats
// that have sailed. The price helpers (dockSellPrice, dockBuyPrice) stay for the views.
import { content } from '@qoti/content';
import { TICKS_PER_DAY } from '../../constants';
import type { Building, System, TickCtx, WorldState } from '../../contracts';
import { isStandard } from '../../state/hamlet';
import { dockView } from '../../view/seasons';
import { regionalPrice } from '../../view/village';
import { dailyOffset } from '../economy/time';
import { renownEffect } from '../renown/api';

/** The neighbor downstream, the only one boats reach. */
export const DOCK_NEIGHBOR = 'millhaven';
/** Units a boat carries, out and back together (the carrier's cart carries 20, or 40 with a post). */
export const BOAT_UNITS = 120;
/** Days between the boat's calls. */
export const BOAT_DAYS = 3;
/** Percent of the regional price the dock gets selling and pays buying. */
export const DOCK_SELL_PERCENT = 92;
export const DOCK_BUY_PERCENT = 110;

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

/** The 08:02 pass: boats that have sailed leave the dock's list. */
export function dockDay(state: WorldState, ctx: TickCtx): void {
  const before = state.dock.boats.length;
  state.dock.boats = state.dock.boats.filter((b) => b.departTick > state.tick);
  if (state.dock.boats.length !== before) ctx.events.push({ e: 'dock.updated', d: dockView(state) });
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
