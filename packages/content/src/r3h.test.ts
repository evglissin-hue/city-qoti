// R3H: the levels data on the specialized defs (BuildingDef.levels), checked as content: each def
// that has levels is a specialized building, level 1 is the def's own number, every level adds
// something and none takes anything away, and the def's good day is possible in some valley (its
// raw goods are made by some producer in content, its customers and its crew have a place to be).
import { describe, expect, it } from 'vitest';
import { content } from './index';
import type { BuildingDef, ProductionMethod, SpecializedLevelsDef } from './types';

const FIELDS = ['crew', 'reach', 'storage', 'capacity'] as const;

/** The specialized buildings the R3H brief names: each must have levels. */
const TABLE = [
  'foresters-lodge',
  'quarry',
  'fishery',
  'market-stall',
  'granary',
  'storehouse',
  'windmill',
  'sawmill',
  'brickworks',
  'trading-post',
];

const withLevels: BuildingDef[] = content.buildings.filter((d) => d.levels);

/** Every method any def or trade can run. */
const METHODS: ProductionMethod[] = [
  ...content.buildings.flatMap((d) => d.methods ?? []),
  ...content.trades.flatMap((t) => (t.method ? [t.method] : [])),
];

/** True when some producer in content makes the good. */
const madeBySomeone = (good: string): boolean => METHODS.some((m) => m.outputs.some(([g]) => g === good));

function arrays(l: SpecializedLevelsDef): [string, number[]][] {
  return FIELDS.flatMap((f) => (l[f] ? [[f, l[f]!] as [string, number[]]] : []));
}

describe('R3H: the levels data', () => {
  it('every specialized building in the brief has levels, and only specialized buildings do', () => {
    for (const id of TABLE) expect(content.buildingById.get(id)?.levels, id).toBeDefined();
    for (const d of withLevels) expect(d.specialized, d.id).toBe(true);
  });

  for (const def of withLevels) {
    describe(def.id, () => {
      const l = def.levels!;

      it('names its good day, and arrays of two or three levels that agree in length', () => {
        expect(['carried', 'customers', 'served', 'full']).toContain(l.good);
        const lists = arrays(l);
        expect(lists.length, 'at least one array').toBeGreaterThan(0);
        for (const [f, a] of lists) expect([2, 3], `${f} length`).toContain(a.length);
        expect(new Set(lists.map(([, a]) => a.length)).size, 'the arrays agree in length').toBe(1);
      });

      it("level 1 is the def's own number", () => {
        if (l.crew) expect(l.crew[0]).toBe(def.jobs?.count);
        if (l.reach) {
          expect(l.reach[0]).toBe(def.reach);
          const food = def.coverage?.find((c) => c.kind === 'food');
          if (def.tags?.includes('market') && food) expect(l.reach[0]).toBe(food.radius);
        }
        if (l.storage) expect(l.storage[0]).toBe(def.storage);
        if (l.capacity) expect(l.capacity[0]).toBe(def.capacity);
      });

      it('never shrinks, and each level adds something', () => {
        const lists = arrays(l);
        const n = lists[0]![1].length;
        for (const [f, a] of lists)
          for (let i = 1; i < a.length; i++)
            expect(a[i]!, `${f} level ${i + 1}`).toBeGreaterThanOrEqual(a[i - 1]!);
        for (let i = 1; i < n; i++)
          expect(
            lists.some(([, a]) => a[i]! > a[i - 1]!),
            `level ${i + 1} adds nothing`,
          ).toBe(true);
      });

      it('its good day is possible by content', () => {
        switch (l.good) {
          case 'carried': {
            const m = def.methods?.[0];
            expect(m?.outputs.length, 'a method with outputs').toBeGreaterThan(0);
            for (const [g] of m!.inputs) expect(madeBySomeone(g), `something makes ${g}`).toBe(true);
            break;
          }
          case 'customers':
            expect(def.tags, 'a market outlet').toEqual(expect.arrayContaining(['outlet', 'market']));
            expect(def.jobs?.role).toBe('vendor');
            expect(l.crew, 'a vendor to serve them').toBeDefined();
            break;
          case 'served': {
            expect(def.enables?.length, 'enables a trade').toBeGreaterThan(0);
            for (const id of def.enables!) {
              const trade = content.tradeById.get(id);
              expect(trade, `trade ${id} exists`).toBeDefined();
              expect(trade!.method, `${id} has a method`).toBeDefined();
              for (const [g] of trade!.method!.inputs)
                expect(madeBySomeone(g), `something makes ${g}`).toBe(true);
            }
            expect(l.capacity, 'room for more of them').toBeDefined();
            break;
          }
          case 'full':
            expect(def.storage ?? l.storage?.[0], 'a store').toBeGreaterThan(0);
            expect(def.jobs?.role, 'porters').toBe('porter');
            expect(l.crew, 'one more porter a level').toBeDefined();
            break;
        }
      });
    });
  }
});
