import { describe, expect, it } from 'vitest';
import { kitById, kits } from './kits';

const OPTS = { size: [2, 2] as [number, number], entrance: [1, 1] as [number, number] };

function tris(kitId: string, opts: object): number {
  return kitById.get(kitId)!.build(opts).getAttribute('position').count / 3;
}

describe('art kits', () => {
  it('are registered once each, in alphabetical order', () => {
    const ids = kits.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it('build vertex-colored geometry with outward normals', () => {
    for (const kit of kits) {
      const g = kit.build(OPTS);
      const pos = g.getAttribute('position');
      expect(pos.count, kit.id).toBeGreaterThan(0);
      expect(pos.count % 3, kit.id).toBe(0);
      expect(g.getAttribute('color').count).toBe(pos.count);
      expect(g.getAttribute('glow').count).toBe(pos.count);
      expect(g.boundingBox!.min.y, kit.id).toBeGreaterThanOrEqual(-0.001);
    }
  });

  it('are deterministic from options and seed', () => {
    for (const kit of kits) {
      const a = kit.build({ ...OPTS, seed: 42 }).getAttribute('color').array;
      const b = kit.build({ ...OPTS, seed: 42 }).getAttribute('color').array;
      expect(Array.from(a), kit.id).toEqual(Array.from(b));
    }
  });

  it('stay within triangle budgets', () => {
    const sizes: Record<string, [number, number]> = {
      cottage: [2, 2],
      house: [2, 3],
      shed: [1, 2],
      'town-hall': [4, 4],
      well: [1, 1],
      windmill: [2, 2],
    };
    for (const kit of kits) {
      if (kit.kind === 'building') {
        const size = sizes[kit.id] ?? [2, 2];
        expect(tris(kit.id, { size, entrance: [0, size[1] - 1] }), kit.id).toBeLessThan(1500);
      } else if (kit.kind === 'decor') {
        expect(tris(kit.id, {}), kit.id).toBeLessThan(400);
      } else {
        expect(tris(kit.id, { lod: 'low' }), kit.id).toBeLessThan(60);
        expect(tris(kit.id, { stage: 0 }), kit.id).toBeLessThanOrEqual(tris(kit.id, {}));
      }
    }
  });

  it('expose glowing panes, anchors and windmill parts', () => {
    const cottage = kitById.get('cottage')!;
    const glow = cottage.build(OPTS).getAttribute('glow').array;
    expect(Array.from(glow).some((v) => v === 1)).toBe(true);
    expect(cottage.anchors!(OPTS).smoke!.length).toBeGreaterThan(0);
    expect(cottage.anchors!(OPTS).lights!.length).toBeGreaterThan(0);
    const parts = kitById.get('windmill')!.parts!(OPTS);
    expect(parts.length).toBe(1);
    expect(parts[0]!.spinAxis).toEqual([0, 0, 1]);
    const lantern = kitById.get('lantern')!;
    expect(Array.from(lantern.build().getAttribute('glow').array).some((v) => v === 1)).toBe(true);
    expect(lantern.anchors!().lights!.length).toBe(1);
  });
});
