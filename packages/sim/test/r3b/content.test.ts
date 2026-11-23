// R3B: static checks on the masters' content (docs/spec/19-evenings.md, Masters). No good the Ledger
// has to wire: every master's good comes from a raw good the trade already takes, in the building it
// already has, in the family R3.0 gave it, and some outlet takes it.
import { content, type MasterDef, type ProductionMethod } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { takes } from '../../src/systems/logistics/stores';

/** The methods a master's building already runs: its trade's, or its def's own. */
function methodsOf(m: MasterDef): ProductionMethod[] {
  const trade = content.tradeById.get(m.of);
  if (trade) return trade.method ? [trade.method] : [];
  return content.buildingById.get(m.of)?.methods ?? [];
}

const FAMILY: Record<string, string> = {
  butter: 'food',
  coats: 'wares',
  cordial: 'treats',
  jam: 'treats',
  mead: 'treats',
  pies: 'treats',
  soap: 'wares',
  'smoked-fish': 'food',
  toys: 'wares',
};

const withRecipe = content.masters.filter((m) => m.method);

describe('the masters of the valley', () => {
  it('keeps one new master a trade a season (the saved state only holds the last season)', () => {
    expect(content.mastery.perTradeSeason).toBe(1);
  });

  it('has a def for the trades and specialized buildings that have masters, sorted, one each', () => {
    const keys = content.masters.map((m) => m.of);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort());
    for (const key of keys) {
      expect(content.tradeById.has(key) || content.buildingById.has(key), key).toBe(true);
    }
  });

  it('takes only raw goods the building already takes or makes, in the same building', () => {
    for (const m of withRecipe) {
      const own = methodsOf(m);
      const known = new Set<string>();
      for (const meth of own) for (const [g] of [...meth.inputs, ...meth.outputs]) known.add(g);
      for (const [g] of m.method!.inputs) {
        expect(content.goodById.get(g)?.raw, `${m.of} takes ${g}, a raw good`).toBe(true);
        expect(known.has(g), `${m.of}: ${g} is in the building's own method`).toBe(true);
      }
    }
  });

  it('makes a good that is not an input anywhere and sits in the family R3.0 gave it', () => {
    for (const m of withRecipe) {
      const good = content.goodById.get(m.good!)!;
      expect(good, m.of).toBeDefined();
      expect(good.family, m.good).toBe(FAMILY[good.id]);
      expect(
        m.method!.outputs.map(([g]) => g),
        m.of,
      ).toEqual([good.id]);
      for (const other of content.masters) {
        for (const [g] of other.method?.inputs ?? [])
          expect(g, `${other.of} takes ${good.id}`).not.toBe(good.id);
      }
      for (const t of content.trades) expect(t.from, `${t.id} takes ${good.id}`).not.toContain(good.id);
    }
  });

  it('has an outlet that takes every master good, so there is always a shelf to sell from', () => {
    const outlets = content.buildings.filter((d) => d.tags?.includes('outlet'));
    expect(outlets.length).toBeGreaterThan(0);
    for (const m of withRecipe) {
      const g = content.goodIndex.get(m.good!)!;
      expect(
        outlets.some((d) => takes(d, g)),
        `${m.good} has an outlet`,
      ).toBe(true);
    }
  });

  it("names a master's good once, and no two masters share one", () => {
    const goods = withRecipe.map((m) => m.good);
    expect(new Set(goods).size).toBe(goods.length);
    expect(goods).toHaveLength(9);
  });

  it('unlocks only pieces that exist and are locked', () => {
    for (const m of content.masters) {
      for (const u of m.unlocks ?? []) {
        expect(content.decorById.get(u)?.locked, `${m.of} unlocks ${u}`).toBe(true);
      }
    }
  });
});
