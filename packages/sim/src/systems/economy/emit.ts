// Ledger events and their throttling (docs/build/i1-wave-notes.md, Events). The caches only
// decide whether an event is worth sending; they never feed back into state, so they live in a
// WeakMap beside the state instead of inside it (a reloaded valley simply sends once more).
import type { Building, EntityId, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { budgetView, buildingView, stocksView, townView } from '../../view';

interface LedgerCache {
  treasury: number;
  leanTimes: boolean;
  stocks: string;
  budget: string;
  /** Last runtime signature sent per building. */
  buildings: Map<EntityId, string>;
}

const caches = new WeakMap<WorldState, LedgerCache>();

function cacheOf(state: WorldState): LedgerCache {
  let c = caches.get(state);
  if (!c) {
    c = { treasury: NaN, leanTimes: false, stocks: '', budget: '', buildings: new Map() };
    caches.set(state, c);
  }
  return c;
}

/** building.updated now (stage or status changed, or a lever moved). */
export function emitBuilding(state: WorldState, ctx: TickCtx, b: Building): void {
  const view = buildingView(b);
  cacheOf(state).buildings.set(b.id, JSON.stringify(view.rt ?? null));
  ctx.events.push({ e: 'building.updated', b: view });
}

/** The hourly pass: building.updated for every building whose runtime view moved since the last one. */
export function emitChangedBuildings(state: WorldState, ctx: TickCtx): void {
  const sent = cacheOf(state).buildings;
  for (const b of state.buildings) {
    if (!b.rt) continue;
    const view = buildingView(b);
    const sig = JSON.stringify(view.rt);
    if (sent.get(b.id) === sig) continue;
    sent.set(b.id, sig);
    ctx.events.push({ e: 'building.updated', b: view });
  }
  if (sent.size > state.buildings.length) {
    for (const id of [...sent.keys()]) if (!findById(state.buildings, id)) sent.delete(id);
  }
}

/** budget.updated and town.updated, now (a command spent or refunded money). */
export function emitMoney(state: WorldState, ctx: TickCtx): void {
  const c = cacheOf(state);
  const budget = budgetView(state);
  c.budget = JSON.stringify(budget);
  c.treasury = state.economy.treasury;
  c.leanTimes = state.economy.leanTimes;
  ctx.events.push({ e: 'budget.updated', b: budget });
  ctx.events.push({ e: 'town.updated', t: townView(state) });
}

/**
 * stocks.updated and budget.updated when they changed since the last ones (or always, with
 * `force`), and town.updated when the treasury moved. Daily with force, hourly without.
 */
export function emitReports(state: WorldState, ctx: TickCtx, force: boolean): void {
  const c = cacheOf(state);
  const stocks = stocksView(state);
  const stocksSig = JSON.stringify(stocks);
  if (force || stocksSig !== c.stocks) {
    c.stocks = stocksSig;
    ctx.events.push({ e: 'stocks.updated', s: stocks });
  }
  const budget = budgetView(state);
  const budgetSig = JSON.stringify(budget);
  if (force || budgetSig !== c.budget) {
    c.budget = budgetSig;
    ctx.events.push({ e: 'budget.updated', b: budget });
  }
  const e = state.economy;
  if (force || e.treasury !== c.treasury || e.leanTimes !== c.leanTimes) {
    c.treasury = e.treasury;
    c.leanTimes = e.leanTimes;
    ctx.events.push({ e: 'town.updated', t: townView(state) });
  }
}
