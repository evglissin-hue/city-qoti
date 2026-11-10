// Market and money bench (C4A): the daily passes of a 150-resident village against the brief's
// budget (market pass under 2 ms per day): prices (with the market.updated view, profit report
// included), wages and income tax, the 18:00 household pass, regional prices, the carrier with
// every family on Always and selling, and a season's interest. Built on the shared village fixture,
// grown to 150 residents in extra households sharing its homes and jobs (the passes never check
// capacity). R1.0: the carrier's daily pass replaces the caravans and their order book.
import { createTickCtx, findById, type Household, type Resident, type WorldState } from '@qoti/sim';
import { villageFixture } from '../../../packages/sim/test/fixtures/village';
import { updatePrices } from '../../../packages/sim/src/systems/market';
import { shopBaskets } from '../../../packages/sim/src/systems/market/baskets';
import { payWages } from '../../../packages/sim/src/systems/market/wages';
import { stepNeighbor } from '../../../packages/sim/src/systems/trade';
// R1.0: the carrier's daily pass, exported by R1.0's sim sweep (R1A grows it).
import { carrierDay } from '../../../packages/sim/src/systems/carrier';
import { chargeInterest } from '../../../packages/sim/src/systems/loans';
import { marketView } from '../../../packages/sim/src/view/village';

export const MARKET_BUDGET_MS = 2;
const RESIDENTS = 150;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** The village fixture grown to `n` residents: copies of its families, in its homes and jobs. */
export function marketVillage(n = RESIDENTS): WorldState {
  const { state } = villageFixture();
  const families = [...state.households];
  let k = 0;
  while (state.residents.length < n) {
    const src = families[k++ % families.length]!;
    const h: Household = {
      ...src,
      id: state.nextId++,
      members: [],
      pantry: [...src.pantry],
      recentFoods: [],
      savings: src.savings,
    };
    delete h.basket;
    delete h.owed;
    state.households.push(h);
    for (const id of src.members) {
      if (state.residents.length >= n) break;
      const r0 = findById(state.residents, id)!;
      const r: Resident = { ...r0, id: state.nextId++, householdId: h.id, needs: [...r0.needs], friends: [] };
      r.modifiers = [];
      r.history = [];
      state.residents.push(r);
      h.members.push(r.id);
      if (r.jobId) findById(state.buildings, r.jobId)?.rt?.workers.push(r.id);
    }
  }
  // A busy carrier, as a full order book was: every family bought up to its reserve and sold over
  // twice it.
  state.carrier.families = state.carrier.families.map((f) => ({
    ...f,
    rule: 'always',
    sell: true,
    set: true,
  }));
  return state;
}

export interface MarketBench {
  lines: string[];
  failures: string[];
  report: Record<string, unknown>;
}

export function benchMarket(): MarketBench {
  const lines: string[] = [];
  const failures: string[] = [];
  const state = marketVillage();
  const ctx = createTickCtx(state);
  const parts = {
    prices: [] as number[],
    wages: [] as number[],
    baskets: [] as number[],
    trade: [] as number[],
  };
  const total: number[] = [];
  for (let day = 0; day < 30; day++) {
    const t0 = performance.now();
    updatePrices(state);
    marketView(state);
    const t1 = performance.now();
    payWages(state, ctx);
    const t2 = performance.now();
    shopBaskets(state, ctx);
    const t3 = performance.now();
    for (const n of state.trade.neighbors) stepNeighbor(state, n, 12345);
    carrierDay(state, ctx);
    if (day % 6 === 5) chargeInterest(state, ctx);
    const t4 = performance.now();
    ctx.events.length = 0;
    if (day < 5) continue; // warm-up
    parts.prices.push(t1 - t0);
    parts.wages.push(t2 - t1);
    parts.baskets.push(t3 - t2);
    parts.trade.push(t4 - t3);
    total.push(t4 - t0);
    state.tick += 4800;
  }
  const ms = median(total);
  const worst = Math.max(...total);
  if (ms > MARKET_BUDGET_MS) failures.push(`market pass ${ms.toFixed(3)} ms per day`);
  lines.push(
    `market          ${state.residents.length} residents, ${state.households.length} households: ` +
      `${ms.toFixed(3)} ms per day median, ${worst.toFixed(3)} ms worst (prices ${median(parts.prices).toFixed(3)}, ` +
      `wages ${median(parts.wages).toFixed(3)}, baskets ${median(parts.baskets).toFixed(3)}, ` +
      `carrier ${median(parts.trade).toFixed(3)}) (budget ${MARKET_BUDGET_MS} ms)  ${ms <= MARKET_BUDGET_MS ? 'ok' : 'OVER BUDGET'}`,
  );
  return {
    lines,
    failures,
    report: {
      residents: state.residents.length,
      households: state.households.length,
      msPerDay: ms,
      worstMs: worst,
      parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, median(v)])),
      budgetMs: MARKET_BUDGET_MS,
    },
  };
}
