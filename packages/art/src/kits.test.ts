import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { kitById, kits } from './kits';

/** Triangle budgets for the bigger buildings (the rest get 2,600). */
const BUILDING_BUDGETS: Record<string, number> = {
  'brick-kiln': 4000,
  'chopping-shed': 2800,
  herbalist: 3000,
  'herb-garden': 2800,
  cheesemaker: 3400,
  cottage: 3500,
  farmstead: 4800,
  house: 3800,
  orchard: 3200,
  school: 3900,
  shop: 4600,
  storehouse: 4000,
  tavern: 6000,
  'town-hall': 6800,
  townhouse: 4200,
  weaver: 3200,
  workshop: 3800,
};

/** C4E: grown and village buildings draw at a distance in their low detail: keep that cheap. */
const LOW_BUDGET = 1500;

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
    for (const g of content.goods.map((x) => x.id)) {
      full[`stock:${g}`] = 4;
      full[`out:${g}`] = 4;
      full[`in:${g}`] = 4;
    }
    for (const kit of kits) {
      if (kit.kind === 'building') {
        const def = content.buildings.find((b) => b.art.kit === kit.id);
        const size = def?.size ?? kit.footprint?.size ?? [2, 2];
        const entrance = def?.entrance ?? kit.footprint?.entrance ?? [0, 1];
        const budget = BUILDING_BUDGETS[kit.id] ?? 2600;
        // Every district style too (grown buildings), and none.
        for (const style of ['', 'timber', 'stone', 'brick', 'plaster']) {
          const base = { size, entrance, params: { ...full, ...(style ? { style } : {}) } };
          for (let seed = 1; seed <= 8; seed++) {
            const high = tris(kit.id, { ...base, seed });
            expect(high, `${kit.id} seed ${seed} ${style}`).toBeLessThan(budget);
            const low = tris(kit.id, { ...base, seed, lod: 'low' });
            expect(low, `${kit.id} low`).toBeLessThanOrEqual(high);
            if (kit.footprint) expect(low, `${kit.id} low ${style}`).toBeLessThan(LOW_BUDGET);
          }
        }
      } else if (kit.kind === 'decor') {
        expect(tris(kit.id, {}), kit.id).toBeLessThan(400);
      } else if (kit.kind === 'vehicle' || kit.kind === 'animal') {
        // Drawn by the dozen as moving parts; the assembled kit is for portraits.
        expect(tris(kit.id, {}), kit.id).toBeLessThan(kit.kind === 'vehicle' ? 2400 : 900);
      } else if (kit.kind === 'nature') {
        // Scattered by the thousand: keep them tiny, and the low version no bigger.
        expect(tris(kit.id, {}), kit.id).toBeLessThan(160);
        expect(tris(kit.id, { lod: 'low' }), kit.id).toBeLessThanOrEqual(tris(kit.id, {}));
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
    // Lantern flames are lit every night (2), not in the seeded share of windows (1).
    const flame = Array.from(lantern.build().getAttribute('glow').array);
    expect(flame.some((v) => v === 2)).toBe(true);
    expect(flame.some((v) => v === 1)).toBe(false);
    expect(lantern.anchors!().lights!.length).toBe(1);
  });
});
