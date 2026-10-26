import { describe, expect, it } from 'vitest';
import { baskets, carts, charters, content, innovations, neighbors, roads, zones } from './index';

// I2 content (C4.0): every reference resolves, values stay in their ranges, words stay clean.
describe('I2 content', () => {
  const goods = (pairs: readonly (readonly [string, number])[]) => pairs.map(([g]) => g);

  it('zones have unique layer values 1 to 5 and lots of 2 to 3 tiles', () => {
    expect(zones.map((z) => z.layerValue).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const z of zones) {
      expect(z.lots.length, z.id).toBeGreaterThan(0);
      for (const l of z.lots) for (const n of l.size) expect(n >= 2 && n <= 3, z.id).toBe(true);
    }
  });

  it('baskets and neighbors name real goods', () => {
    expect(baskets.map((b) => b.tier).sort()).toEqual(['craftsfolk', 'settler']);
    for (const b of baskets) {
      for (const g of b.groups) {
        expect(g.perDay, `${b.tier}.${g.id}`).toBeGreaterThan(0);
        for (const id of goods(g.goods)) expect(content.goodById.has(id), id).toBe(true);
      }
    }
    for (const n of neighbors) {
      for (const id of [...goods(n.sells), ...goods(n.buys)]) expect(content.goodById.has(id), id).toBe(true);
      for (const [id, season, p] of n.seasonal ?? []) {
        expect(content.goodById.has(id) && season >= 0 && season <= 3 && p > 0, id).toBe(true);
      }
    }
  });

  it('charters, innovations and carts are well formed', () => {
    const village = charters.find((c) => c.id === 'village')!;
    expect(village.goals.map((g) => g.target)).toEqual([30, 3, 5, 5, 1]);
    expect(new Set(village.goals.map((g) => g.id)).size).toBe(village.goals.length);
    expect(innovations.map((i) => i.id)).toEqual([...innovations.map((i) => i.id)].sort());
    for (const i of innovations) expect(i.unlocks.length, i.id).toBeGreaterThan(0);
    for (const c of carts) {
      for (const [road] of c.ticksPerTile) expect(roads.find((r) => r.id === road)?.carts, road).toBe(true);
    }
    expect(roads.find((r) => r.id === 'street')).toMatchObject({ layerValue: 3, carts: true, capacity: 80 });
  });

  it('writes without em or en dashes', () => {
    const text = JSON.stringify([zones, baskets, neighbors, innovations, charters, carts]);
    expect(text).not.toMatch(/—|–/);
  });
});
