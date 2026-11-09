// @vitest-environment happy-dom
// Playtest item 9: the numbers behind one-click trade deals, the drift re-send, and the promise to
// leave a hand-edited order alone.
import { content } from '@qoti/content';
import type { Command, StandingOrderInput } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { mockVillageSession } from './mocks/session';
import { dealDrifted, dealOrder, isManagedDeal, setDeal, syncDeals, toggleDeal } from './deals';

const base = (g: string) => content.goodById.get(g)!.basePrice;
type Set = Extract<Command, { t: 'trade.setStandingOrder' }>;

describe('deal numbers', () => {
  it('buys 3 to 6 days of use, from yesterday when there was any', () => {
    const o = dealOrder('bread', 'buy', { population: 40, consumedYesterday: 20, season: 0 }, 'millhaven');
    expect(o).toMatchObject({ min: 60, max: 120, neighbor: 'millhaven' });
    expect(o.floor).toBe(Math.round(base('bread') * 0.8));
    expect(o.ceiling).toBe(Math.round(base('bread') * 1.6));
  });

  it('falls back to residents times a rate when nothing was used yesterday', () => {
    const o = dealOrder('planks', 'sell', { population: 50, consumedYesterday: 0, season: 1 }, 'millhaven');
    // 50 x 0.3 = 15 a day, five days kept back.
    expect(o).toMatchObject({ min: 0, max: 75 });
  });

  it('allows firewood up to 2.5 times base in autumn and winter, 1.6 otherwise', () => {
    const t = { population: 30, season: 0 };
    const wood = base('firewood');
    expect(dealOrder('firewood', 'buy', t, 'stonecross').ceiling).toBe(Math.round(wood * 1.6));
    expect(dealOrder('firewood', 'buy', { ...t, season: 2 }, 'stonecross').ceiling).toBe(
      Math.round(wood * 2.5),
    );
    expect(dealOrder('firewood', 'buy', { ...t, season: 3 }, 'stonecross').ceiling).toBe(
      Math.round(wood * 2.5),
    );
    expect(dealOrder('wheat', 'buy', { ...t, season: 3 }, 'millhaven').ceiling).toBe(
      Math.round(base('wheat') * 1.6),
    );
  });

  it('always makes an order the sim accepts, even for an empty hamlet', () => {
    for (const g of content.goods) {
      for (const side of ['buy', 'sell'] as const) {
        const o = dealOrder(g.id, side, { population: 0, season: 0 }, '');
        expect(o.min).toBeLessThanOrEqual(o.max);
        expect([o.min, o.max, o.floor, o.ceiling].every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
        expect(o.max).toBeGreaterThan(0);
      }
    }
  });
});

describe('drift', () => {
  const town = (use: number) => ({ population: 40, consumedYesterday: use, season: 0 });
  const old = dealOrder('bread', 'buy', town(20), 'millhaven');

  it('leaves an order alone within a quarter and re-sends past it', () => {
    expect(dealDrifted(old, dealOrder('bread', 'buy', town(23), 'millhaven'))).toBe(false);
    expect(dealDrifted(old, dealOrder('bread', 'buy', town(30), 'millhaven'))).toBe(true);
  });

  it('re-sends a live deal on sync, once, and then rests', () => {
    const { session, submitted } = mockVillageSession();
    const m = session.mirror;
    const line = m.stocks.value!.lines.find((l) => l.good === 'bread')!;
    const stale = dealOrder('bread', 'buy', { ...town(10), population: m.residents.size }, 'millhaven');
    // The order the post holds is stale: the town now uses four times as much.
    line.consumedYesterday = 40;
    m.trade.value = { ...m.trade.value!, orders: [{ good: 'bread', ...stale }] };
    session.ui.dealMarks.set('post:bread', stale);
    submitted.length = 0;
    expect(syncDeals(session)).toBe(1);
    const sent = submitted.find((c): c is Set => c.t === 'trade.setStandingOrder')!;
    expect(sent.good).toBe('bread');
    expect(sent.order!.min).toBeGreaterThan(stale.min * 3);
    // The mirror catches up; nothing more to send.
    m.trade.value = { ...m.trade.value!, orders: [{ good: 'bread', ...sent.order! }] };
    submitted.length = 0;
    expect(syncDeals(session)).toBe(0);
    expect(submitted).toHaveLength(0);
  });

  it('leaves hand-edited orders alone', () => {
    const { session, submitted } = mockVillageSession();
    const m = session.mirror;
    const line = m.stocks.value!.lines.find((l) => l.good === 'bread')!;
    line.consumedYesterday = 80;
    const mine = dealOrder('bread', 'buy', { ...town(10), population: m.residents.size }, 'millhaven');
    // Changed by hand in Standing orders: max moved, so it no longer matches what we sent.
    session.ui.dealMarks.set('post:bread', mine);
    // And a hand-made order with its own prices, never ours.
    const wool = { good: 'wool', min: 5, max: 40, floor: 7, ceiling: 0, neighbor: 'millhaven' };
    m.trade.value = {
      ...m.trade.value!,
      orders: [{ good: 'bread', ...mine, max: mine.max + 5 }, wool],
    };
    submitted.length = 0;
    expect(syncDeals(session)).toBe(0);
    expect(submitted).toHaveLength(0);
    expect(isManagedDeal('wool', wool, undefined)).toBe(false);
  });
});

describe('toggling', () => {
  it('turns a deal on with computed numbers and off again', () => {
    const { session, submitted } = mockVillageSession();
    const m = session.mirror;
    m.trade.value = { ...m.trade.value!, orders: [] };
    toggleDeal(session, 'post', 'wheat', 'buy', 'millhaven');
    const on = submitted.pop() as Set;
    expect(on.order).toMatchObject({ neighbor: 'millhaven' });
    expect(on.order!.min).toBeGreaterThan(0);
    expect(on.via).toBeUndefined();
    m.trade.value = { ...m.trade.value!, orders: [{ good: 'wheat', ...(on.order as StandingOrderInput) }] };
    toggleDeal(session, 'post', 'wheat', 'buy', 'millhaven');
    expect(submitted.pop()).toMatchObject({ good: 'wheat', order: null });
    setDeal(session, 'dock', 'wheat', null);
    expect(submitted.pop()).toMatchObject({ via: 'dock' });
  });
});
