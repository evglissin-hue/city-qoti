import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { kitById, kits } from './kits';

/** Triangle budgets for the bigger buildings (the rest get 2,600). */
const BUILDING_BUDGETS: Record<string, number> = {
  house: 3800,
  storehouse: 4000,
  'town-hall': 6800,
};

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
      // Buildings may sink a little (jetty piles, half-buried heaps); everything else sits on y 0.
      expect(g.boundingBox!.min.y, kit.id).toBeGreaterThanOrEqual(kit.kind === 'building' ? -0.2 : -0.001);
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
    // Every seed, with every stock pile full, crops grown and a sign: the worst case per kit.
    const full: Record<string, number | string> = { growth: 3, sign: 'Sign' };
    for (const g of ['logs', 'planks', 'stone', 'flour', 'bread', 'vegetables', 'fish', 'wheat']) {
      full[`stock:${g}`] = 4;
      full[`out:${g}`] = 4;
      full[`in:${g}`] = 4;
    }
    for (const kit of kits) {
      if (kit.kind === 'building') {
        const def = content.buildings.find((b) => b.art.kit === kit.id);
        const base = { size: def?.size ?? [2, 2], entrance: def?.entrance ?? [0, 1], params: full };
        const budget = BUILDING_BUDGETS[kit.id] ?? 2600;
        for (let seed = 1; seed <= 8; seed++) {
          const high = tris(kit.id, { ...base, seed });
          expect(high, `${kit.id} seed ${seed}`).toBeLessThan(budget);
          expect(tris(kit.id, { ...base, seed, lod: 'low' }), `${kit.id} low`).toBeLessThanOrEqual(high);
        }
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
