// R1X: the debug showcases build R1's buildings, not the removed chain defs. Every def they place
// is in content, every business carries a trade of its def with a level and a keeper, and the piles
// and stores name only R1 goods.
import { content } from '@qoti/content';
import type { BuildingView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { villageShowcase } from './showcase';
import { SHOWCASE_TRADES } from './showcaseBusiness';
import { townShowcase } from './townShowcase';

function check(m: Mirror, expectedMin: number): void {
  const all = [...m.buildings.values()] as BuildingView[];
  expect(all.length).toBeGreaterThanOrEqual(expectedMin);
  const goods = new Set(content.goods.map((g) => g.id));
  const trades = new Set<string>();
  for (const b of all) {
    const def = content.buildingById.get(b.def);
    expect(def, `no content def for ${b.def}`).toBeDefined();
    const hosted = SHOWCASE_TRADES[b.def];
    if (hosted) {
      expect(b.trade, `${b.def} has no trade`).toBeDefined();
      expect(hosted).toContain(b.trade);
      expect(content.tradeById.has(b.trade!)).toBe(true);
      expect([1, 2, 3]).toContain(b.level);
      expect(m.residents.get(b.keeperId!), `${b.def} keeper`).toBeDefined();
      trades.add(b.trade!);
    } else expect(b.trade).toBeUndefined();
    for (const lines of [b.rt?.input, b.rt?.output, b.rt?.store])
      for (const [g] of lines ?? []) expect(goods.has(g), `${g} is not an R1 good`).toBe(true);
  }
  expect(trades.size).toBeGreaterThanOrEqual(5);
}

describe('showcases', () => {
  it('the village places only content defs, and every business has a trade, a level and a keeper', () => {
    const m = new Mirror();
    const r = villageShowcase(m);
    expect(r.buildings).toBe(62);
    check(m, 62);
    // The specialized buildings that replaced the chain pieces are there.
    const defs = new Set([...m.buildings.values()].map((b) => b.def));
    for (const d of ['brickworks', 'granary', 'windmill', 'fishery', 'foresters-lodge'])
      expect(defs).toContain(d);
  });

  it('the dense village (the 150 building scene) is the same', () => {
    const m = new Mirror();
    const r = villageShowcase(m, { dense: true });
    expect(r.buildings).toBe(140);
    check(m, 140);
  });

  it('the town places only content defs, and every business has a trade, a level and a keeper', () => {
    const m = new Mirror();
    const r = townShowcase(m, { buildings: 200, decor: 100, trees: 100 });
    expect(r.buildings).toBeGreaterThan(150);
    check(m, 150);
  });
});
