import { describe, expect, it } from 'vitest';
import type { BalanceLine, BalancesView, DemandBarView } from '@qoti/sim';
import { FAMILY_ICON, FAMILY_LABEL, FAMILY_ORDER } from './families';
import {
  chipReading,
  compact,
  coverNumber,
  demandTitle,
  folkReading,
  materialReadings,
  winterReading,
} from './strip';

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
    expect(coverNumber({ cover: 400, use: 5, stock: 20 })).toBe('4');
    expect(coverNumber({ cover: 449, use: 5, stock: 22 })).toBe('4');
    expect(coverNumber({ cover: 0, use: 5, stock: 0 })).toBe('0');
    expect(coverNumber({ cover: 9900, use: 1, stock: 99 })).toBe('99+');
    expect(coverNumber({ cover: 50000, use: 1, stock: 500 })).toBe('99+');
    // Held but not used yet: plenty, never none (the book and the strip agree).
    expect(coverNumber({ cover: 0, use: 0, stock: 120 })).toBe('99+');
    expect(coverNumber({ cover: 0, use: 0, stock: 0 })).toBe('0');
  });
  it('fills to ten days, ticks the reserve and warms under it', () => {
    const r = chipReading(line());
    expect(r.cover).toBe('4 days');
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
  it('says flavor in the singular for a one-flavor family', () => {
    const r = chipReading(
      line({ family: 'fuel', flavors: [{ good: 'firewood', onOffer: true, made: true, stock: 5 }] }),
    );
    expect(r.title).toContain('1 of 1 flavor on offer: firewood.');
  });
  it('leads with units in store, then days of cover as a small second figure', () => {
    const r = chipReading(line());
    expect(r.label).toBe('Food');
    expect(r.amount).toBe('212');
    expect(r.cover).toBe('4 days');
    expect(r.coverWarm).toBe(false);
    expect(chipReading(line({ family: 'fuel', cover: 9900 })).cover).toBe('99+ days');
    expect(chipReading(line({ family: 'treats' })).label).toBe('Treats');
    expect(chipReading(line({ cover: 100, stock: 40 })).cover).toBe('1 day');
  });
  it('warms the cover figure under two days', () => {
    expect(chipReading(line({ cover: 199 })).coverWarm).toBe(true);
    expect(chipReading(line({ cover: 200 })).coverWarm).toBe(false);
  });
  it('reads an empty family as a plain warm zero with no cover figure', () => {
    const r = chipReading(line({ stock: 0, cover: 0 }));
    expect(r.amount).toBe('0');
    expect(r.empty).toBe(true);
    expect(r.cover).toBeNull();
    expect(chipReading(line()).empty).toBe(false);
  });
  it('holds plenty when something is in store and nothing uses it', () => {
    const r = chipReading(line({ family: 'wares', stock: 120, cover: 0, use: 0 }));
    expect(r.cover).toBe('99+ days');
    expect(r.fill).toBe(1);
    expect(r.title).toContain('Wares: plenty, since nothing uses it yet.');
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

describe('compact amounts', () => {
  it('keeps small numbers whole and shortens thousands', () => {
    expect(compact(0)).toBe('0');
    expect(compact(999)).toBe('999');
    expect(compact(1000)).toBe('1k');
    expect(compact(1234)).toBe('1.2k');
    expect(compact(9999)).toBe('9.9k');
    expect(compact(12_400)).toBe('12k');
    expect(compact(1_250_000)).toBe('1.2m');
    expect(compact(-3)).toBe('0');
  });
});

describe('material chips', () => {
  const materials = line({ family: 'materials', reserve: 20, rule: 'essentials', flavors: [] });
  const stocks: Record<string, number> = { timber: 6, stone: 40, brick: 0 };
  const stockOf = (g: string) => stocks[g];
  const goods = (r: ReturnType<typeof materialReadings>) => r.map((m) => m.good);

  it('stands Timber and Stone alone, with units in store, when no site waits', () => {
    const r = materialReadings({ line: materials, stockOf, rank: 'hamlet' });
    expect(goods(r)).toEqual(['timber', 'stone']);
    expect(r.map((m) => m.amount)).toEqual(['6', '40']);
    for (const m of r) {
      expect(m.of).toBeNull();
      expect(m.warm).toBe(false);
      expect(m.fill).toBe(1);
    }
    expect(r[0]?.title).toBe(
      'Timber: 6 in store. No open site waits on it. The carrier: Essentials only, holding 20 beyond what sites need.',
    );
  });
  it('reads "6 of 42" in the warm style, the bar filled by that share, while sites need more', () => {
    const sites = { goods: [{ good: 'timber', need: 42, stock: 6 }] };
    const [timber, stone] = materialReadings({ line: materials, sites, stockOf, rank: 'hamlet' });
    expect(timber?.of).toBe('6 of 42');
    expect(timber?.warm).toBe(true);
    expect(timber?.fill).toBeCloseTo(6 / 42);
    expect(timber?.title).toBe(
      'Timber: 6 in store. Open sites still need 42. The carrier: Essentials only, holding 20 beyond what sites need.',
    );
    // Stone is not needed: calm.
    expect(stone?.of).toBeNull();
    expect(stone?.warm).toBe(false);
  });
  it('is calm when the stores already cover what sites need', () => {
    const sites = { goods: [{ good: 'stone', need: 10, stock: 40 }] };
    const stone = materialReadings({ line: materials, sites, stockOf, rank: 'hamlet' })[1];
    expect(stone?.of).toBeNull();
    expect(stone?.warm).toBe(false);
    expect(stone?.fill).toBe(1);
    expect(stone?.title).toContain('Open sites still need 10.');
  });
  it('reads a bare empty store as a warm zero', () => {
    const r = materialReadings({ line: materials, stockOf: () => 0, rank: 'hamlet' });
    expect(r.map((m) => m.amount)).toEqual(['0', '0']);
    expect(r.every((m) => m.warm)).toBe(true);
  });
  it('brings Brick in once held, once a site needs it, or from Village', () => {
    expect(goods(materialReadings({ line: materials, stockOf, rank: 'hamlet' }))).not.toContain('brick');
    expect(goods(materialReadings({ line: materials, stockOf, rank: 'village' }))).toContain('brick');
    expect(goods(materialReadings({ line: materials, stockOf, rank: 'town' }))).toContain('brick');
    const held = materialReadings({
      line: materials,
      stockOf: (g) => (g === 'brick' ? 12 : 1),
      rank: 'hamlet',
    });
    expect(goods(held)).toEqual(['timber', 'stone', 'brick']);
    const sites = { goods: [{ good: 'brick', need: 8, stock: 0 }] };
    const needed = materialReadings({ line: materials, sites, stockOf, rank: 'hamlet' });
    expect(needed[2]?.of).toBe('0 of 8');
  });
  it('falls back to the line flavors when no stocks view is in yet', () => {
    const withFlavors = line({
      family: 'materials',
      flavors: [{ good: 'timber', onOffer: true, made: true, stock: 9 }],
    });
    expect(materialReadings({ line: withFlavors, rank: 'hamlet' })[0]?.amount).toBe('9');
  });
});

describe('folk chip', () => {
  it('shows residents, open jobs and the hover in words', () => {
    const r = folkReading({ folk: 15, working: 9, openJobs: 5, empty: [1, 2, 3] }, 5);
    expect(r.amount).toBe('15');
    expect(r.jobs).toBe('5 jobs open');
    expect(r.warm).toBe(true);
    expect(r.title).toBe(
      '15 folk in 5 households, 9 at work. 5 jobs stand open, 3 workplaces with nobody yet. More Homes bring more folk.',
    );
  });
  it('says one job in the singular and is calm while every workplace has someone', () => {
    const r = folkReading({ folk: 8, working: 6, openJobs: 1, empty: [] }, 1);
    expect(r.jobs).toBe('1 job open');
    expect(r.warm).toBe(false);
    expect(r.title).toBe('8 folk in 1 household, 6 at work. 1 job stands open. More Homes bring more folk.');
  });
  it('shows nothing beside the figure when no job stands open', () => {
    const r = folkReading({ folk: 4, working: 4, openJobs: 0, empty: [] }, 2);
    expect(r.jobs).toBeNull();
    expect(r.title).toBe('4 folk in 2 households, 4 at work. No job stands open.');
  });
  it('welcomes the first family when nobody has moved in', () => {
    const r = folkReading({ folk: 0, working: 0, openJobs: 0, empty: [] }, 0);
    expect(r.amount).toBe('0');
    expect(r.title).toContain('Nobody has moved in yet');
  });
});
