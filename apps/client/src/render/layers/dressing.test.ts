import { describe, expect, it } from 'vitest';
import { content, type DressingRule } from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import type { BuildingView, HouseholdView, LotView, ResidentView } from '@qoti/sim';
import type { Mirror, MirrorChange } from '../../state/mirror';
import { DRESSING_BUDGET, DRESSING_SEED, dressingLayer, dressingSubject } from './dressing';
import type { LayerContext } from './types';

interface World {
  buildings: BuildingView[];
  households?: Partial<HouseholdView>[];
  residents?: Partial<ResidentView>[];
  lots?: Partial<LotView>[];
  season?: 0 | 1 | 2 | 3;
  /** Today's absolute day (the tick is set to land on it). */
  today?: number;
}

function mirrorOf(w: World): Mirror {
  const today = w.today ?? 100;
  const tick = today * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR + 10;
  return {
    buildings: new Map(w.buildings.map((b) => [b.id, b])),
    households: new Map((w.households ?? []).map((h) => [h.id!, h as HouseholdView])),
    residents: new Map((w.residents ?? []).map((r) => [r.id!, r as ResidentView])),
    lots: new Map((w.lots ?? []).map((l) => [l.id!, l as LotView])),
    clock: { value: { season: w.season ?? 1 } },
    tick: { value: tick },
  } as unknown as Mirror;
}

function building(id: number, def: string, extra: Partial<BuildingView> = {}): BuildingView {
  return { id, def, x: 10, z: 10, rot: 0, stage: 'built', ...extra } as unknown as BuildingView;
}

function change(over: Partial<MirrorChange> = {}): MirrorChange {
  return {
    full: false,
    buildings: false,
    households: false,
    residents: false,
    village: false,
    ...over,
  } as MirrorChange;
}

const rule: DressingRule = {
  id: 'test-barrels',
  who: { kind: ['home'] },
  anchor: 'yard',
  piece: { kit: 'barrels' },
  count: { base: 0, stat: 'firewood', perUnit: 1, max: 6 },
  seed: 1,
};

function setup(world: World, rules?: readonly DressingRule[], level: 'some' | 'all' = 'all') {
  const mirror = mirrorOf(world);
  const layer = rules ? dressingLayer(rules) : dressingLayer();
  const env = { dressing: level };
  layer.init({ env, mirror } as unknown as LayerContext);
  return { mirror, layer, env };
}

describe('dressingSubject (V3.0)', () => {
  it('reads a home: tier, members, firewood doubled in winter, cloth from tier', () => {
    const b = building(1, 'cottage');
    const household = { id: 5, homeId: 1, tier: 'merchant', members: [1, 2, 3] } as Partial<HouseholdView>;
    const summer = dressingSubject(mirrorOf({ buildings: [b], households: [household], season: 1 }), b);
    expect(summer).toMatchObject({ kind: 'home', tier: 'merchant', season: 'summer', level: 1 });
    expect(summer.stats).toMatchObject({ members: 3, firewood: 3, cloth: 2 });
    const winter = dressingSubject(mirrorOf({ buildings: [b], households: [household], season: 3 }), b);
    expect(winter.season).toBe('winter');
    expect(winter.stats.firewood).toBe(6);
  });

  it('takes the lowest household id when several live in a home', () => {
    const b = building(1, 'cottage');
    const hs = [
      { id: 9, homeId: 1, tier: 'patron', members: [1] },
      { id: 4, homeId: 1, tier: 'settler', members: [2, 3] },
    ] as Partial<HouseholdView>[];
    const s = dressingSubject(mirrorOf({ buildings: [b], households: hs }), b);
    expect(s.tier).toBe('settler');
    expect(s.stats.members).toBe(2);
    expect(s.stats.cloth).toBe(0);
  });

  it('counts births in the last 28 days only', () => {
    const b = building(1, 'cottage');
    const kids = [
      { id: 1, stage: 'child', bornDay: 100 },
      { id: 2, stage: 'child', bornDay: 73 },
      { id: 3, stage: 'child', bornDay: 72 },
      { id: 4, stage: 'adult', bornDay: 100 },
      { id: 5, stage: 'child' },
    ] as Partial<ResidentView>[];
    const hh = { id: 5, homeId: 1, tier: 'settler', members: [1, 2, 3, 4, 5] } as Partial<HouseholdView>;
    const s = dressingSubject(mirrorOf({ buildings: [b], households: [hh], residents: kids, today: 100 }), b);
    expect(s.stats.births).toBe(2);
  });

  it('reads a business: trade, level, stock and workers', () => {
    const b = building(2, 'workshop', {
      trade: 'baker',
      level: 2,
      rt: {
        workers: 3,
        output: [
          ['bread', 4],
          ['cheese', 2],
        ],
        store: [],
      } as unknown as BuildingView['rt'],
    });
    const s = dressingSubject(mirrorOf({ buildings: [b] }), b);
    expect(s).toMatchObject({ kind: 'business', trade: 'baker', level: 2 });
    expect(s.stats).toMatchObject({ stock: 6, workers: 3, level: 2 });
  });

  it('reads a store: fill as a percent of its storage', () => {
    const b = building(3, 'storehouse', {
      rt: {
        workers: 0,
        output: [],
        store: [
          ['timber', 200],
          ['stone', 200],
        ],
      } as unknown as BuildingView['rt'],
    });
    expect(content.buildingById.get('storehouse')?.storage).toBe(800);
    const s = dressingSubject(mirrorOf({ buildings: [b] }), b);
    expect(s.kind).toBe('specialized');
    expect(s.stats.fill).toBe(50);
  });

  it('gives kind null for a construction site and for a def that is none of the three', () => {
    const site = building(4, 'cottage', { stage: 'construction' });
    expect(dressingSubject(mirrorOf({ buildings: [site] }), site).kind).toBeNull();
    const well = building(5, 'well');
    expect(dressingSubject(mirrorOf({ buildings: [well] }), well).kind).toBeNull();
  });

  it('reads missing data as 0', () => {
    const b = building(1, 'cottage');
    const s = dressingSubject(mirrorOf({ buildings: [b] }), b);
    expect(s.tier).toBeUndefined();
    expect(s.stats).toMatchObject({ births: 0, members: 0, fill: 0, stock: 0, workers: 0, cloth: 0 });
  });
});

describe('dressingLayer (V3.0)', () => {
  it('declares its budget and seed', () => {
    expect(DRESSING_BUDGET).toEqual({ triangles: 300_000, draws: 12 });
    expect(typeof DRESSING_SEED).toBe('number');
  });

  it('with the shipped empty table costs nothing and never drops the still frame', () => {
    const { layer, mirror } = setup({ buildings: [building(1, 'cottage')] });
    expect(layer.frame?.(0.016)).toBe(false);
    layer.update(change({ buildings: true }));
    mirror.buildings.set(2, building(2, 'cottage', { x: 20 }));
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.placementCount()).toBe(0);
  });

  const hh = (members: number[]) =>
    [{ id: 5, homeId: 1, tier: 'settler', members }] as Partial<HouseholdView>[];

  it('places pieces on the first frame, then settles', () => {
    const { layer } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule]);
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBe(2);
    expect(layer.placementsOf(1).every((p) => p.kit === 'barrels' && p.rule === 'test-barrels')).toBe(true);
    expect(layer.frame?.(0.016)).toBe(false);
  });

  it('keeps the same placements when nothing about the subject changed', () => {
    const { layer } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule]);
    layer.frame?.(0.016);
    const before = layer.placementsOf(1);
    layer.update(change({ households: true, residents: true, village: true }));
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.placementsOf(1)).toBe(before);
  });

  it('re-resolves when the household grows', () => {
    const { layer, mirror } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule]);
    layer.frame?.(0.016);
    mirror.households.set(5, { id: 5, homeId: 1, tier: 'settler', members: [1, 2, 3, 4] } as HouseholdView);
    layer.update(change({ households: true }));
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBe(4);
  });

  it('re-resolves when the season turns (firewood doubles) and drops removed buildings', () => {
    const { layer, mirror } = setup(
      { buildings: [building(1, 'cottage')], households: hh([1, 2]), season: 1 },
      [rule],
    );
    layer.frame?.(0.016);
    mirror.clock.value = { season: 2 } as never;
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBe(4);
    mirror.buildings.delete(1);
    layer.update(change({ buildings: true }));
    expect(layer.frame?.(0.016)).toBe(true);
    expect(layer.placementCount()).toBe(0);
  });

  it('on Low draws only rules marked low', () => {
    const { layer } = setup({ buildings: [building(1, 'cottage')], households: hh([1, 2]) }, [rule], 'some');
    expect(layer.frame?.(0.016)).toBe(false);
    expect(layer.placementCount()).toBe(0);
    const low = setup(
      { buildings: [building(1, 'cottage')], households: hh([1, 2]) },
      [{ ...rule, low: true }],
      'some',
    );
    expect(low.layer.frame?.(0.016)).toBe(true);
    expect(low.layer.placementCount()).toBe(2);
  });
});
