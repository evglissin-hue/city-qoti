// R1A: the Balances view in full (docs/spec/13-ledger.md, Reports: Balances): five lines in family
// order, cover from stock and use, pantries counted, wool never a flavor, the price weighted by
// yesterday's purchases, and a year of history a day at a time.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DAYS_PER_SEASON, GOOD_FAMILIES, TICKS_PER_DAY } from '../../src/constants';
import { purchase } from '../../src/systems/market/api';
import { BALANCE_HISTORY_DAYS } from '../../src/systems/economy/index';
import { createTickCtx } from '../../src/turn';
import { balanceStock, familyStock, familyUseHundredths } from '../../src/systems/market/balances';
import { balancesView } from '../../src/view/balances';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { runDays, untilDaily } from '../market/helpers';

const gi = (id: string): number => content.goodIndex.get(id)!;

describe('balancesView', () => {
  it('has the five lines in GOOD_FAMILIES order', () => {
    const { state } = villageFixture();
    expect(balancesView(state).lines.map((l) => l.family)).toEqual([...GOOD_FAMILIES]);
  });

  it('cover for Food is stock times 100 over use, and stock counts pantries', () => {
    const { state, households } = villageFixture();
    const food = balancesView(state).lines[0]!;
    const h = state.households.find((x) => x.id === households[0])!;
    h.pantry[gi('bread')] = (h.pantry[gi('bread')] ?? 0) + 40;
    const after = balancesView(state).lines[0]!;
    expect(after.stock).toBe(food.stock + 40);
    expect(after.stock).toBe(familyStock(balanceStock(state), 0));
    const useH = familyUseHundredths(state, 0);
    expect(useH).toBeGreaterThan(0);
    expect(after.cover).toBe(Math.floor((after.stock * 10000) / useH));
  });

  it('never lists wool as a flavor, and lists the shelf goods in goods order', () => {
    const { state } = villageFixture();
    const wares = balancesView(state).lines[3]!;
    const ids = wares.flavors.map((f) => f.good);
    expect(ids).not.toContain('wool');
    expect(ids).toEqual(['cloth', 'furniture', 'candles'].filter((g) => ids.includes(g)));
    for (const line of balancesView(state).lines) {
      const idx = line.flavors.map((f) => gi(f.good));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it('weights the price by what households bought yesterday', () => {
    const { state } = villageFixture();
    const bread = gi('bread');
    const veg = gi('vegetables');
    state.market.prices[bread] = 100;
    state.market.prices[veg] = 20;
    const plain = balancesView(state).lines[0]!.price;
    state.market.bought = new Array<number>(content.goods.length).fill(0);
    state.market.bought[bread] = 9;
    state.market.bought[veg] = 1;
    const weighted = balancesView(state).lines[0]!.price;
    expect(weighted).toBe(Math.round((9 * 100 + 1 * 20) / 10));
    expect(weighted).not.toBe(plain);
  });

  it('rolls what households bought at 00:10', () => {
    const f = villageFixture();
    const { state } = f;
    expect(state.market.boughtToday).toBeUndefined();
    const h = state.households[0]!;
    h.savings = 100000;
    const before = moneySnapshot(state);
    const got = purchase(state, h, gi('bread'), 3);
    expect(got).toBeGreaterThan(0);
    expectMoneyInvariant(before, state);
    expect(state.market.boughtToday![gi('bread')]).toBe(got);
    untilDaily(state, 0, 10);
    expect(state.market.bought![gi('bread')]).toBeGreaterThanOrEqual(got);
    expect(state.market.boughtToday!.every((n) => n === 0)).toBe(true);
  });

  it('grows the history a row a day and keeps a year of days', () => {
    const { state } = villageFixture();
    expect(BALANCE_HISTORY_DAYS).toBe(4 * DAYS_PER_SEASON);
    const ctx = createTickCtx(state);
    runDays(state, 3, ctx);
    expect(state.carrier.history!.length).toBe(3);
    expect(state.carrier.history![0]!.length).toBe(GOOD_FAMILIES.length);
    for (const line of balancesView(state).lines) expect(line.history.length).toBe(3);
    runDays(state, BALANCE_HISTORY_DAYS, ctx);
    expect(state.carrier.history!.length).toBe(BALANCE_HISTORY_DAYS);
    expect(state.tick).toBeGreaterThan(TICKS_PER_DAY * BALANCE_HISTORY_DAYS);
  });

  it('passes the closed pass through', () => {
    const { state } = villageFixture();
    expect(balancesView(state).passClosed).toBe(false);
  });
});
