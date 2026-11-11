// The carrier at City scale (R1A; docs/spec/22-quality.md, R1 budgets: under 0.5 ms a day). The
// market bench's village grown to 2,000 residents in 400 households, at City rank with a Trading
// Post and a River Dock, every family on Always and selling, and the larder emptied each morning so
// the cart (400 units) and the boat (120) both come in full: the heaviest visit the rules allow.
import { content } from '@qoti/content';
import { createTickCtx, type WorldState } from '@qoti/sim';
import { insertBuilding } from '../../../packages/sim/src/state/place';
import { dayIndex } from '../../../packages/sim/src/systems/economy/time';
import { carrierDay } from '../../../packages/sim/src/systems/carrier';
import { BOAT_DAYS } from '../../../packages/sim/src/systems/carrier/terms';
import { withTradingPost } from '../../../packages/sim/test/market/helpers';
import { marketVillage } from './market';

export const CARRIER_BUDGET_MS = 0.5;
const RESIDENTS = 2000;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export interface CarrierBench {
  lines: string[];
  failures: string[];
  report: Record<string, unknown>;
}

/** Empties every store's Food, Wares and Treats, so the carrier buys a full load. */
function emptyLarder(state: WorldState): void {
  for (const b of state.buildings) {
    const rt = b.rt;
    if (!rt) continue;
    for (let g = 0; g < content.goods.length; g++) {
      const f = content.goods[g]!.family;
      if (f === 'food' || f === 'wares' || f === 'treats') rt.store[g] = 0;
    }
  }
  for (const h of state.households) h.pantry.fill(0);
}

export function carrierBench(): CarrierBench {
  const lines: string[] = [];
  const failures: string[] = [];
  const state = marketVillage(RESIDENTS);
  state.charter.rank = 'city';
  state.economy.treasury = 1_000_000_00;
  state.carrier.budget = 1000_00;
  // Storehouses with room for whatever comes.
  for (const b of state.buildings) b.rt?.store.fill(0);
  const dock = content.buildingById.get('river-dock');
  if (dock) insertBuilding(state, null, dock, 96, 60, 0, 0, { site: false });
  const times: number[] = [];
  let units = 0;
  withTradingPost(state, () => {
    const ctx = createTickCtx(state);
    for (let day = 0; day < 30; day++) {
      emptyLarder(state);
      // The boat calls every day of the bench: its three days always just passed.
      state.carrier.boatDay = dayIndex(state.tick) - BOAT_DAYS;
      const t0 = performance.now();
      carrierDay(state, ctx);
      const t1 = performance.now();
      ctx.events.length = 0;
      const row = state.carrier.bought[state.carrier.bought.length - 1]!;
      if (day === 29) units = row.reduce((a, b) => a + b, 0);
      state.tick += 4800;
      if (day < 5) continue; // warm-up
      times.push(t1 - t0);
    }
  });
  const ms = median(times);
  const worst = Math.max(...times);
  if (ms > CARRIER_BUDGET_MS) failures.push(`carrier ${ms.toFixed(3)} ms per day`);
  lines.push(
    `carrier         ${state.residents.length} residents at City rank, ${units} units a visit: ` +
      `${ms.toFixed(3)} ms per day median, ${worst.toFixed(3)} ms worst (budget ${CARRIER_BUDGET_MS} ms)  ` +
      `${ms <= CARRIER_BUDGET_MS ? 'ok' : 'OVER BUDGET'}`,
  );
  return {
    lines,
    failures,
    report: { residents: state.residents.length, units, msPerDay: ms, worstMs: worst, budgetMs: CARRIER_BUDGET_MS },
  };
}
