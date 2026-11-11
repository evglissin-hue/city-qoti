import { describe, expect, it } from 'vitest';
import type { BalanceLine, BalancesView, DemandBarView } from '@qoti/sim';
import { FAMILY_ICON, FAMILY_LABEL, FAMILY_ORDER } from './families';
import { chipReading, coverNumber, demandTitle, winterReading } from './strip';

function line(over: Partial<BalanceLine> = {}): BalanceLine {
  return {
    family: 'food',
    stock: 212,
    use: 52,
    cover: 400,
    flavors: [
      { good: 'bread', onOffer: true, made: true, stock: 10 },
      { good: 'fish', onOffer: true, made: true, stock: 10 },
      { good: 'grain', onOffer: true, made: true, stock: 10 },
      { good: 'cheese', onOffer: false, made: false, stock: 0 },
    ],
    price: 100,
    carriedIn: 0,
    carriedOut: 0,
    carriedInYesterday: 0,
    carriedOutYesterday: 0,
    rule: 'always',
    reserve: 3,
    sell: false,
    mark: null,
    history: [],
    ...over,
  };
}

function view(lines: BalanceLine[]): BalancesView {
  return {
    lines,
    budget: 0,
    spentToday: 0,
    tab: 0,
    tabCap: 0,
    passClosed: false,
    plan: { reserve: 8, food: null, fuel: null, deal: null, buildFirst: null },
    offers: [],
  };
}

describe('families', () => {
  it('names and pictures every family once, in order', () => {
    expect(FAMILY_ORDER).toEqual(['food', 'fuel', 'materials', 'wares', 'treats']);
    for (const f of FAMILY_ORDER) {
      expect(FAMILY_LABEL[f]).toBeTruthy();
      expect(FAMILY_ICON[f]).toBeTruthy();
    }
  });
});

describe('demand title', () => {
  const bar = (over: Partial<DemandBarView>): DemandBarView => ({
    kind: 'homes',
    value: 40,
    lit: false,
    reasons: [],
    why: [],
    ...over,
  });
  it('says the town needs land when lit, then lists the reasons', () => {
    const t = demandTitle('homes', bar({ lit: true, why: ['Newcomers would come.'] }));
    expect(t).toBe('Homes: the town needs more Homes zoned.\nNewcomers would come.');
  });
  it('says growth is on its way when quiet with a lot waiting', () => {
    expect(demandTitle('shops', bar({}))).toBe('Shops: a lot is waiting, so growth is on its way.');
  });
  it('is quiet at zero', () => {
    expect(demandTitle('farmland', bar({ value: 0 }))).toBe('Farmland: quiet for now.');
  });
});

describe('balance chip', () => {
  it('reads whole days, capped at 99+', () => {
    expect(coverNumber(400)).toBe('4');
    expect(coverNumber(449)).toBe('4');
    expect(coverNumber(0)).toBe('0');
    expect(coverNumber(9900)).toBe('99+');
    expect(coverNumber(50000)).toBe('99+');
  });
  it('fills to ten days, ticks the reserve and warms under it', () => {
    const r = chipReading(line());
    expect(r.days).toBe('4');
    expect(r.fill).toBeCloseTo(0.4);
    expect(r.reserveAt).toBeCloseTo(0.3);
    expect(r.markAt).toBeNull();
    expect(r.low).toBe(false);
    expect(chipReading(line({ cover: 200 })).low).toBe(true);
    expect(chipReading(line({ cover: 5000 })).fill).toBe(1);
  });
  it('has one pip per flavor, filled when on offer', () => {
    expect(chipReading(line()).pips).toEqual([true, true, true, false]);
  });
  it('shows the winter mark tick only while a mark is set', () => {
    expect(chipReading(line({ mark: 8 })).markAt).toBeCloseTo(0.8);
    expect(chipReading(line({ mark: null })).markAt).toBeNull();
  });
  it('words the title like the design note', () => {
    expect(chipReading(line()).title).toBe(
      'Food: 4 days of cover. 212 in store, 52 used a day. 3 of 4 flavors on offer: bread, fish, grain. The carrier: Always, holding 3 days.',
    );
  });
  it('holds Materials as units, with no day tick', () => {
    const r = chipReading(line({ family: 'materials', reserve: 20, rule: 'essentials', cover: 30 }));
    expect(r.reserveAt).toBeNull();
    expect(r.title).toContain('The carrier: Essentials only, holding 20 beyond what sites need.');
    expect(r.low).toBe(true);
  });
  it('says flavor in the singular for a one-flavor family', () => {
    const r = chipReading(
      line({ family: 'fuel', flavors: [{ good: 'firewood', onOffer: true, made: true, stock: 5 }] }),
    );
    expect(r.title).toContain('1 of 1 flavor on offer: firewood.');
  });
  it('says Never plainly', () => {
    expect(chipReading(line({ rule: 'never' })).title.endsWith('The carrier: Never.')).toBe(true);
  });
});

describe('winter reserve bar', () => {
  it('is absent while no line carries a mark', () => {
    expect(winterReading(view([line(), line({ family: 'fuel' })]))).toBeNull();
  });
  it('counts families at their mark and words the title', () => {
    const w = winterReading(
      view([
        line({ cover: 600, mark: 8 }),
        line({ family: 'fuel', cover: 900, mark: 8 }),
        line({ family: 'wares' }),
      ]),
    );
    expect(w).not.toBeNull();
    expect(w?.marked).toBe(2);
    expect(w?.atMark).toBe(1);
    expect(w?.fill).toBeCloseTo(0.5);
    expect(w?.title).toBe('Put by for winter: Food 6 of 8 days, Fuel 9 of 8 days.');
  });
});
