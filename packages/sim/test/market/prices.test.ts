// C4A: the price rule (docs/spec/13-ledger.md, Market and prices). Curve points, smoothing,
// clamps, then the daily pass on the village fixture under shortage and glut. Constants come from
// constants.ts and content, so retuning them does not break these tests.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  PRICE_CLAMP,
  PRICE_CURVE,
  PRICE_HISTORY_DAYS,
  PRICE_SMOOTHING,
  TARGET_COVER,
} from '../../src/constants';
import { buildView } from '../../src/view';
import { coverOf, multiplierFor, stepPrice, targetPrice } from '../../src/systems/market/prices';
import { updatePrices } from '../../src/systems/market';
import { townStock } from '../../src/view/hamlet';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, runDays } from './helpers';

/** Cover in hundredths of a day for a curve point's c / T in hundredths. */
const coverAt = (ratio: number) => ratio * TARGET_COVER;

describe('the price curve', () => {
  it('hits every curve point exactly', () => {
    for (const [ratio, m] of PRICE_CURVE) expect(multiplierFor(coverAt(ratio)), `c/T ${ratio}`).toBe(m);
  });

  it('interpolates linearly between points', () => {
    for (let i = 1; i < PRICE_CURVE.length; i++) {
      const [x0, y0] = PRICE_CURVE[i - 1]!;
      const [x1, y1] = PRICE_CURVE[i]!;
      const mid = coverAt((x0 + x1) / 2);
      expect(Math.abs(multiplierFor(mid) - (y0 + y1) / 2)).toBeLessThanOrEqual(1);
      // Monotonic: more cover never raises the multiplier.
      expect(multiplierFor(coverAt(x0))).toBeGreaterThanOrEqual(multiplierFor(mid));
      expect(multiplierFor(mid)).toBeGreaterThanOrEqual(multiplierFor(coverAt(x1)));
    }
  });

  it('holds flat beyond the ends: 2.5x for an empty shelf, 0.5x for a mountain', () => {
    const first = PRICE_CURVE[0]!;
    const last = PRICE_CURVE[PRICE_CURVE.length - 1]!;
    expect(multiplierFor(0)).toBe(first[1]);
    expect(multiplierFor(coverAt(first[0]) - 10)).toBe(first[1]);
    expect(multiplierFor(coverAt(last[0]) * 5)).toBe(last[1]);
  });

  it('measures cover in hundredths of a day against at least one unit of demand', () => {
    expect(coverOf(30, 10)).toBe(300);
    expect(coverOf(5, 0)).toBe(500);
    expect(coverOf(0, 12)).toBe(0);
  });
});

describe('a day of price movement', () => {
  const base = 200;
  const lo = (base * PRICE_CLAMP[0]) / 100;
  const hi = (base * PRICE_CLAMP[1]) / 100;

  it('targets base x m, within the clamps', () => {
    expect(targetPrice(base, coverAt(100))).toBe(base);
    expect(targetPrice(base, 0)).toBe(Math.round((base * PRICE_CURVE[0]![1]) / 100));
    expect(targetPrice(base, 1_000_000)).toBeGreaterThanOrEqual(lo);
    expect(targetPrice(base, 0)).toBeLessThanOrEqual(hi);
  });

  it('moves a quarter of the way each day, at least a penny, never past the clamps', () => {
    expect(stepPrice(base, base, 500)).toBe(base + Math.round((300 * PRICE_SMOOTHING) / 100));
    expect(stepPrice(base, base, 100)).toBe(base - Math.round((100 * PRICE_SMOOTHING) / 100));
    expect(stepPrice(base, 201, 200)).toBe(200);
    expect(stepPrice(base, 200, 200)).toBe(200);
    expect(stepPrice(base, hi, 10_000)).toBe(hi);
    expect(stepPrice(base, lo, 0)).toBe(lo);
  });

  it('climbs smoothly toward the target and settles on it', () => {
    let p = base;
    const target = targetPrice(base, 0);
    const seen: number[] = [];
    for (let d = 0; d < 40; d++) {
      const next = stepPrice(base, p, target);
      expect(next).toBeGreaterThanOrEqual(p);
      // Never a jump of more than a quarter of the gap (plus the rounding penny).
      expect(next - p).toBeLessThanOrEqual(Math.ceil((target - p) / 4) + 1);
      p = next;
      seen.push(p);
    }
    expect(p).toBe(target);
  });
});

describe('the daily market pass', () => {
  it('raises a short good and lowers a glut, with cover and history', () => {
    const { state } = villageFixture();
    const bread = good('bread');
    const logs = good('logs');
    // Bread: wanted 40 a day, 12 on the shelves (0.1 of the target cover). Logs: nobody asks.
    state.market.prices[bread] = content.goods[bread]!.basePrice;
    state.market.demand[bread] = 40;
    state.market.demand[logs] = 0;
    state.economy.yesterday.consumed.fill(0);
    const stock = townStock(state);
    updatePrices(state);
    expect(state.market.cover[bread]).toBe(coverOf(stock[bread]!, 40));
    expect(state.market.prices[bread]).toBeGreaterThan(content.goods[bread]!.basePrice);
    expect(state.market.prices[logs]).toBeLessThan(content.goods[logs]!.basePrice);
  });

  it('reads demand as what households wanted or the town used, whichever is more', () => {
    const { state } = villageFixture();
    const planks = good('planks');
    state.market.demand[planks] = 0;
    state.economy.yesterday.consumed[planks] = 200;
    updatePrices(state);
    expect(state.market.cover[planks]).toBe(coverOf(townStock(state)[planks]!, 200));
    expect(state.market.prices[planks]).toBeGreaterThan(content.goods[planks]!.basePrice);
  });

  it('lets a good nobody makes or wants drift back to base', () => {
    const { state } = villageFixture();
    const tools = good('tools');
    const base = content.goods[tools]!.basePrice;
    state.market.prices[tools] = base * 2;
    state.market.demand[tools] = 0;
    for (let d = 0; d < 30; d++) updatePrices(state);
    expect(state.market.prices[tools]).toBe(base);
  });

  it('runs at 00:10 once the market is open: prices move, history grows, market.updated goes out', () => {
    const { state } = villageFixture();
    const before = moneySnapshot(state);
    runDays(state, 3);
    expect(state.market.history.length).toBe(Math.min(PRICE_HISTORY_DAYS, 5 + 3));
    const moved = content.goods.filter((g, i) => state.market.prices[i] !== g.basePrice);
    expect(moved.length).toBeGreaterThan(3);
    for (let i = 0; i < content.goods.length; i++) {
      const base = content.goods[i]!.basePrice;
      expect(state.market.prices[i]!).toBeGreaterThanOrEqual((base * PRICE_CLAMP[0]) / 100);
      expect(state.market.prices[i]!).toBeLessThanOrEqual((base * PRICE_CLAMP[1]) / 100);
    }
    expectMoneyInvariant(before, state);
  });

  it('keeps prices at base before the Village rank', () => {
    const { state } = villageFixture();
    state.charter.rank = 'hamlet';
    state.market.prices = content.goods.map((g) => g.basePrice);
    runDays(state, 2);
    expect(state.market.prices).toEqual(content.goods.map((g) => g.basePrice));
  });

  it('explains each price in the market view', () => {
    const { state } = villageFixture();
    runDays(state, 2);
    const view = buildView(state).market!;
    const bread = view.lines.find((l) => l.good === 'bread')!;
    expect(bread.target).toBeGreaterThan(0);
    expect(bread.why!.length).toBeGreaterThan(10);
    expect(bread.why).not.toMatch(/—/);
    expect(view.firstDay).toBeGreaterThanOrEqual(0);
  });
});
