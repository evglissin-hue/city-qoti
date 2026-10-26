import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';
import { constructionGeometry } from './kits/construction';
import { wheatTileGeometry } from './kits/fields';
import { bundleGeometry } from './kits/goods';
import { EXTRA_KINDS, extraGeometry, residentGeometry, residentLook, SPECIES_IDS } from './kits/residents';

const tris = (g: { getAttribute(n: string): { count: number } }): number =>
  g.getAttribute('position').count / 3;

describe('residents', () => {
  it('build every species at three levels of detail with paint and rig channels', () => {
    expect(SPECIES_IDS).toHaveLength(7);
    for (const sp of SPECIES_IDS) {
      const full = residentGeometry(sp, 'full');
      const simple = residentGeometry(sp, 'simple');
      const dot = residentGeometry(sp, 'dot');
      for (const g of [full, simple, dot]) {
        expect(g.getAttribute('paint').count, sp).toBe(g.getAttribute('position').count);
        expect(g.getAttribute('rig').count, sp).toBe(g.getAttribute('position').count);
        expect(g.boundingBox!.min.y, sp).toBeGreaterThanOrEqual(-0.001);
      }
      expect(tris(full), sp).toBeLessThan(380);
      expect(tris(simple), sp).toBeLessThan(100);
      expect(tris(dot), sp).toBeLessThanOrEqual(16);
      // About 0.3 tile tall, more with ears and tails.
      expect(full.boundingBox!.max.y, sp).toBeGreaterThan(0.26);
      expect(full.boundingBox!.max.y, sp).toBeLessThan(0.42);
    }
    for (const kind of EXTRA_KINDS) expect(tris(extraGeometry(kind)), kind).toBeGreaterThan(0);
  });

  it('dress by look seed, job and tier, deterministically', () => {
    const a = residentLook({ species: 'fox', look: 7 });
    expect(residentLook({ species: 'fox', look: 7 })).toEqual(a);
    expect(residentLook({ species: 'fox', look: 8 })).not.toEqual(a);
    const child = residentLook({ species: 'fox', look: 7, stage: 'child' });
    expect(child.scale[1]).toBeLessThan(a.scale[1]);
    const kinds = (job: string, tier?: string): string[] =>
      residentLook({ species: 'rabbit', look: 3, job, ...(tier ? { tier } : {}) }).extras.map((e) => e.kind);
    expect(kinds('bakery')).toEqual(expect.arrayContaining(['apron', 'hat:baker']));
    expect(kinds('fishers-hut')).toContain('hat:souwester');
    expect(kinds('farmhouse')).toContain('hat:straw');
    expect(kinds('bakery', 'patron')).toContain('hat:top');
    expect(residentLook({ species: 'dragon', look: 1 }).species).toBe('rabbit');
  });
});

describe('goods', () => {
  it('have a carried bundle for every good', () => {
    for (const good of content.goods) {
      const g = bundleGeometry(good.id);
      expect(tris(g), good.id).toBeGreaterThan(4);
      expect(g.boundingBox!.min.y, good.id).toBeGreaterThanOrEqual(-0.001);
    }
  });
});

describe('construction and runtime detail', () => {
  it('build all four stages for every building, growing toward the roof', () => {
    for (const def of content.buildings) {
      const counts = [0, 1, 2, 3].map((stage) =>
        tris(constructionGeometry({ kit: def.art.kit, size: def.size, stage, delivered: { logs: 2 } })),
      );
      for (const n of counts) expect(n, def.id).toBeGreaterThan(10);
      expect(counts[3]!, def.id).toBeGreaterThanOrEqual(counts[1]!);
    }
  });

  it('show stock piles and crops from runtime levels', () => {
    const store = content.buildingById.get('storehouse')!;
    const kit = kitById.get('storehouse')!;
    const empty = tris(kit.build({ size: store.size, entrance: store.entrance }));
    const full = tris(
      kit.build({
        size: store.size,
        entrance: store.entrance,
        params: { 'stock:logs': 4, 'stock:stone': 4 },
      }),
    );
    expect(full).toBeGreaterThan(empty);
    const plot = kitById.get('vegetable-plot')!;
    expect(tris(plot.build({ size: [2, 2], params: { growth: 3 } }))).toBeGreaterThan(
      tris(plot.build({ size: [2, 2], params: { growth: 0 } })),
    );
    expect(tris(wheatTileGeometry(3))).toBeGreaterThan(tris(wheatTileGeometry(0)));
  });

  it('honor customization: swatches, chimney and sign', () => {
    const def = content.buildingById.get('cottage')!;
    const kit = kitById.get('cottage')!;
    const base = { size: def.size, entrance: def.entrance, seed: 3 };
    const colors = (params: Record<string, string | boolean>): number[] =>
      Array.from(kit.build({ ...base, params }).getAttribute('color').array);
    expect(colors({ wall: 'rose' })).not.toEqual(colors({ wall: 'sky' }));
    expect(colors({ roof: 'plum' })).not.toEqual(colors({ roof: 'moss' }));
    expect(kit.anchors!({ ...base, params: { chimney: false } }).smoke).toHaveLength(0);
    expect(kit.anchors!({ ...base, params: { chimney: true } }).smoke!.length).toBeGreaterThan(0);
    expect(kit.anchors!({ ...base, params: { sign: 'Rose Cottage' } }).sign).toBeDefined();
    for (const id of ['bakery', 'market-stall', 'storehouse', 'town-hall']) {
      const d = content.buildingById.get(id)!;
      const a = kitById.get(id)!.anchors!({ size: d.size, entrance: d.entrance, params: { sign: 'Hello' } });
      expect(a.sign, id).toBeDefined();
    }
  });
});
