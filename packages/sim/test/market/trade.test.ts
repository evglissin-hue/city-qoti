// C4A: the Trading Post (docs/spec/13-ledger.md, Trade): regional prices with drift and impact,
// standing orders, caravans, export bans and the peddler's retirement. Isolated: caravans are run
// through `caravanDay` directly, or the clock runs with the residents' schedule and the household
// pass off so only trade moves goods and money.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  DRIFT_RANGE,
  DRIFT_STEP,
  LEDGER_CATEGORIES,
  TICKS_PER_DAY,
  TRADE_BUY_PERCENT,
  TRADE_SELL_PERCENT,
} from '../../src/constants';
import type { StandingOrder, WorldState } from '../../src/contracts';
import { withoutSystems } from '../../src/systems';
import { driftStep, stepNeighbor } from '../../src/systems/trade';
import { caravanCapacity, caravanDay, postBuyPrice, postSellPrice } from '../../src/systems/trade/caravans';
import { tradingPost } from '../../src/systems/trade/post';
import { createTickCtx } from '../../src/turn';
import { townStock } from '../../src/view/hamlet';
import { regionalPrice, tradeView } from '../../src/view/village';
import { villageFixture } from '../fixtures/village';
import { run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, runDays, untilDaily, withTradingPost } from './helpers';

const cat = (id: string) => LEDGER_CATEGORIES.findIndex((c) => c.id === id);
const ISOLATE = ['residents', 'baskets', 'logistics', 'production', 'wages'];

function order(state: WorldState, g: string, o: Partial<StandingOrder>): void {
  const full = { min: 0, max: 1000, floor: 0, ceiling: 0, neighbor: '', ...o };
  run(state, { t: 'trade.setStandingOrder', good: g, order: full });
}

describe('regional prices', () => {
  it('walks drift by at most the daily step, within bounds, the same way every time', () => {
    for (let day = 0; day < 200; day++) {
      const s = driftStep(12345, day, 0, 3);
      expect(Math.abs(s)).toBeLessThanOrEqual(DRIFT_STEP);
      expect(driftStep(12345, day, 0, 3)).toBe(s);
    }
    const { state } = villageFixture();
    const n = state.trade.neighbors[0]!;
    const wheat = good('wheat');
    const seen = new Set<number>();
    for (let d = 0; d < 300; d++) {
      state.tick += TICKS_PER_DAY;
      const was = n.drift[wheat]!;
      stepNeighbor(state, n, 777);
      const now = n.drift[wheat]!;
      expect(now).toBeGreaterThanOrEqual(DRIFT_RANGE[0]);
      expect(now).toBeLessThanOrEqual(DRIFT_RANGE[1]);
      expect(Math.abs(now - was)).toBeLessThanOrEqual(DRIFT_STEP + 20);
      seen.add(now);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('lets impact recover a tenth of the way home each day', () => {
    const { state } = villageFixture();
    const n = state.trade.neighbors[0]!;
    const planks = good('planks');
    n.impact[planks] = 800;
    stepNeighbor(state, n, 1);
    expect(n.impact[planks]).toBe(820);
    for (let d = 0; d < 200; d++) stepNeighbor(state, n, 1);
    expect(n.impact[planks]).toBe(1000);
  });

  it('prices the post at 1.2x to buy and 0.85x to sell', () => {
    const { state } = villageFixture();
    const p = regionalPrice(state, 'millhaven', good('planks'))!;
    expect(postSellPrice(state, 'millhaven', good('planks'))).toBe(
      Math.round((p * TRADE_SELL_PERCENT) / 100),
    );
    expect(postBuyPrice(state, 'millhaven', good('planks'))).toBeNull();
    const w = regionalPrice(state, 'millhaven', good('wheat'))!;
    expect(postBuyPrice(state, 'millhaven', good('wheat'))).toBe(Math.round((w * TRADE_BUY_PERCENT) / 100));
  });
});

describe('standing orders and caravans', () => {
  it('sells a surplus at the best price, unit by unit, and books the exports', () => {
    const { state } = villageFixture();
    withTradingPost(state, (post) => {
      const before = moneySnapshot(state);
      const planks = good('planks');
      const stock = townStock(state)[planks]!;
      order(state, 'planks', { max: stock - 12 });
      const first = postSellPrice(state, 'millhaven', planks)!;
      const ctx = createTickCtx(state);
      caravanDay(state, ctx);
      expect(townStock(state)[planks]).toBe(stock - 12);
      const exports = state.economy.today.money[cat('exports')]!;
      expect(exports).toBeGreaterThan(0);
      expect(exports).toBeLessThanOrEqual(12 * first);
      // Each unit nudged Millhaven's planks price down.
      expect(postSellPrice(state, 'millhaven', planks)).toBeLessThan(first);
      const log = state.trade.log[state.trade.log.length - 1]!;
      expect(log).toMatchObject({ neighbor: 'millhaven', good: planks, qty: -12, pennies: exports });
      expect(state.trade.caravans).toHaveLength(1);
      expect(ctx.events.some((e) => e.e === 'notify' && e.kind === 'caravan')).toBe(true);
      expect(tradeView(state).postId).toBe(post.id);
      expectMoneyInvariant(before, state);
    });
  });

  it('holds back when the price falls under the floor, and never sells a banned good', () => {
    const { state } = villageFixture();
    withTradingPost(state, () => {
      const planks = good('planks');
      const stock = townStock(state)[planks]!;
      const price = postSellPrice(state, 'millhaven', planks)!;
      order(state, 'planks', { max: 0, floor: price - 3 });
      caravanDay(state, createTickCtx(state));
      const sold = stock - townStock(state)[planks]!;
      expect(sold).toBeGreaterThan(0);
      expect(sold).toBeLessThan(10);
      expect(postSellPrice(state, 'millhaven', planks)!).toBeLessThan(price - 3);
      state.levers.exportBans[planks] = true;
      const left = townStock(state)[planks]!;
      order(state, 'planks', { max: 0 });
      caravanDay(state, createTickCtx(state));
      expect(townStock(state)[planks]).toBe(left);
    });
  });

  it('buys a shortfall, pays at the gate, and unloads when the caravan comes home', () => {
    const { state } = villageFixture();
    withTradingPost(state, (post) => {
      const before = moneySnapshot(state);
      const wheat = good('wheat');
      const stock = townStock(state)[wheat]!;
      order(state, 'wheat', { min: stock + 10 });
      withoutSystems(ISOLATE, () => untilDaily(state, 8, 1));
      expect(state.economy.today.money[cat('imports')]).toBeGreaterThan(0);
      const caravan = state.trade.caravans[0]!;
      expect(caravan.buying).toEqual([[wheat, 10]]);
      expect(caravan.returnTick - caravan.departTick).toBe(
        content.neighborById.get(caravan.neighbor)!.days * TICKS_PER_DAY,
      );
      expect(townStock(state)[wheat]).toBe(stock);
      // The next morning the order sees the wheat on the road and does not order it twice.
      withoutSystems(ISOLATE, () => untilDaily(state, 8, 1));
      expect(state.trade.caravans.filter((c) => c.buying.length > 0)).toHaveLength(1);
      withoutSystems(ISOLATE, () => runDays(state, 3));
      expect(state.trade.caravans).toHaveLength(0);
      expect(townStock(state)[wheat]).toBe(stock + 10);
      expect(post.rt!.store[wheat]).toBeGreaterThanOrEqual(10);
      expectMoneyInvariant(before, state);
    });
  });

  it('respects the ceiling and the credit line when buying', () => {
    const { state } = villageFixture();
    withTradingPost(state, () => {
      const wheat = good('wheat');
      const price = postBuyPrice(state, 'millhaven', wheat)!;
      order(state, 'wheat', { min: 1000, ceiling: price - 1 });
      caravanDay(state, createTickCtx(state));
      expect(state.economy.today.money[cat('imports')]).toBe(0);
      // Plenty of room under the ceiling, but only a little money.
      order(state, 'wheat', { min: 1000, ceiling: 0 });
      const spend = state.economy.treasury - 5 * price;
      state.economy.treasury -= spend;
      state.economy.external -= spend;
      const before = moneySnapshot(state);
      caravanDay(state, createTickCtx(state));
      const bought = state.trade.caravans.flatMap((c) => c.buying).reduce((n, [, q]) => n + q, 0);
      expect(bought).toBeGreaterThan(0);
      expect(bought).toBeLessThanOrEqual(caravanCapacity(state));
      expect(state.economy.leanTimes).toBe(false);
      expect(state.economy.treasury).toBeGreaterThanOrEqual(-1 * 200 * 100);
      expectMoneyInvariant(before, state);
    });
  });

  it('does nothing without a Trading Post', () => {
    const { state } = villageFixture();
    expect(tradingPost(state)).toBeNull();
    order(state, 'planks', { max: 0 });
    const stock = townStock(state);
    caravanDay(state, createTickCtx(state));
    expect(townStock(state)).toEqual(stock);
    expect(state.trade.caravans).toHaveLength(0);
  });
});

describe('the peddler', () => {
  it('retires once a Trading Post stands', () => {
    const run10 = (post: boolean) => {
      const { state } = villageFixture();
      state.economy.forSale[good('logs')] = true;
      const go = () => withoutSystems(ISOLATE, () => untilDaily(state, 10, 1));
      if (post) withTradingPost(state, go);
      else go();
      return state.economy.today.money[cat('peddler')]!;
    };
    expect(run10(false)).toBeGreaterThan(0);
    expect(run10(true)).toBe(0);
  });
});
