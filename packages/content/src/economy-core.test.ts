import { describe, expect, it } from 'vitest';
import { commissions, content, neighbors } from './index';

// R1A: neighbors sell every family, commissions ask for real goods, deals name a family and a side.
describe('neighbors, commissions and charters (R1A)', () => {
  const families = ['food', 'fuel', 'materials', 'wares', 'treats'];

  it('has a seller for every family', () => {
    for (const family of families) {
      const sells = neighbors.some((n) =>
        n.sells.some(([g]) => content.goods[content.goodIndex.get(g)!]?.family === family),
      );
      expect(sells, family).toBe(true);
    }
  });

  it('names goods that exist in every list', () => {
    for (const n of neighbors) {
      for (const [g] of [...n.sells, ...n.buys]) expect(content.goodIndex.has(g), `${n.id} ${g}`).toBe(true);
    }
    for (const c of commissions) {
      for (const [g, qty] of 'goods' in c.ask ? c.ask.goods : []) {
        expect(content.goodIndex.has(g), `${c.id} ${g}`).toBe(true);
        expect(qty).toBeGreaterThan(0);
      }
    }
  });

  it('names a family and a side in every deal', () => {
    for (const n of neighbors) {
      expect(n.deals?.length ?? 0, n.id).toBeGreaterThan(0);
      for (const [family, side, percent] of n.deals ?? []) {
        expect(families, `${n.id} ${family}`).toContain(family);
        expect(['buy', 'sell'], `${n.id} ${family}`).toContain(side);
        expect(percent).toBeGreaterThan(0);
      }
    }
  });

  it('asks the Village for Food with flavors', () => {
    const goal = content.charterById.get('village')!.goals.find((g) => g.id === 'food')!;
    expect(goal.text).toBe('5 days of Food with 3 flavors');
    expect(goal.measure.flavors).toBe(3);
  });
});
