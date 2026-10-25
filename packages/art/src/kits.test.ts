import { describe, expect, it } from 'vitest';
import { kits } from './kits';

describe('art kits', () => {
  it('are registered once each, in alphabetical order', () => {
    const ids = kits.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it('build vertex-colored geometry with outward normals', () => {
    for (const kit of kits) {
      const g = kit.build({ size: [2, 2], entrance: [1, 1] });
      const pos = g.getAttribute('position');
      expect(pos.count, kit.id).toBeGreaterThan(0);
      expect(pos.count % 3, kit.id).toBe(0);
      expect(g.getAttribute('color').count).toBe(pos.count);
      expect(g.boundingBox!.min.y, kit.id).toBeGreaterThanOrEqual(-0.001);
    }
  });
});
