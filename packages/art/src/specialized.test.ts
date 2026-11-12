import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { artKitId, kitById } from './kits';

const NEW = ['brickworks', 'granary', 'market-square', 'foresters-lodge'] as const;
const OLD = ['brick-kiln', 'clay-pit', 'storehouse', 'market-stall', 'woodcutter', 'chopping-shed'];

function tris(id: string, opts: Record<string, unknown> = {}): number {
  return (
    kitById
      .get(id)!
      .build({ seed: 3, ...opts })
      .getAttribute('position').count / 3
  );
}

describe('R1E specialized kits', () => {
  it.each(NEW)('%s is registered and builds within budget at both levels', (id) => {
    expect(kitById.has(id)).toBe(true);
    const near = tris(id);
    const far = tris(id, { lod: 'low' });
    expect(near).toBeLessThanOrEqual(4000);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThanOrEqual(250);
  });

  it('content defs resolve to the new kits', () => {
    for (const [def, kit] of [
      ['brick-kiln', 'brickworks'],
      ['granary', 'granary'],
      ['market-square', 'market-square'],
    ] as const) {
      const d = content.buildings.find((b) => b.art.params?.kit === kit);
      if (d) expect(artKitId(d.art), def).toBe(kit);
    }
    expect(artKitId({ kit: 'brick-kiln', params: { kit: 'brickworks' } })).toBe('brickworks');
  });

  it('piles change the geometry', () => {
    expect(tris('granary', { params: { 'stock:grain': 4, 'stock:cheese': 4 } })).not.toBe(tris('granary'));
    expect(tris('brickworks', { params: { 'out:brick': 4 } })).not.toBe(tris('brickworks'));
    expect(tris('market-square', { params: { 'stock:bread': 4 } })).not.toBe(tris('market-square'));
    expect(tris('foresters-lodge', { params: { 'out:timber': 4 } })).not.toBe(tris('foresters-lodge'));
  });

  it.each(OLD)('the old %s kit still builds', (id) => {
    expect(tris(id)).toBeGreaterThan(0);
  });
});

describe('the Market Hall', () => {
  it('roofs the Market Square on the same footprint, within budget near and far', () => {
    const kit = kitById.get('market-square')!;
    const opts = { seed: 3, size: [3, 3] as [number, number], entrance: [1, 2] as [number, number] };
    const tris = (params: Record<string, boolean>, lod?: 'low'): number =>
      kit.build({ ...opts, params, ...(lod ? { lod } : {}) }).getAttribute('position').count / 3;
    expect(tris({ hall: true })).toBeGreaterThan(tris({}));
    expect(tris({ hall: true })).toBeLessThanOrEqual(4000);
    expect(tris({ hall: true }, 'low')).toBeLessThanOrEqual(250);
    const g = kit.build({ ...opts, params: { hall: true } });
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeGreaterThan(-0.1);
    expect(g.boundingBox!.max.x).toBeLessThan(3.1);
    expect(g.boundingBox!.max.y).toBeGreaterThan(2);
  });
});
