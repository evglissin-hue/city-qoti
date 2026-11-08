// Playtest round seven: the six Village pieces and the five pricier pieces have kits of their own,
// and window boxes draw the color the player chose.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { artKitId, kitById } from './kits';
import { fitModules } from './kits/modules';
import { customOf } from './kits/style';
import type { KitBuildOptions } from './kits/types';

const VILLAGE = ['cafe-table', 'flower-cart', 'fountain', 'lamp-post', 'maypole', 'notice-board'];
const FINE = ['flower-trellis', 'rain-barrel', 'shop-sign', 'tool-rack', 'weathervane'];
const defId = (kit: string): string => (kit === 'shop-sign' ? 'painted-shop-sign' : kit);

describe('decor kits (playtest round seven)', () => {
  it('draws every Village piece and fine piece with a kit of its own', () => {
    for (const id of [...VILLAGE, ...FINE]) {
      const def = content.decorById.get(defId(id));
      expect(def, id).toBeDefined();
      expect(artKitId(def!.art), id).toBe(id);
      const kit = kitById.get(id)!;
      expect(kit.kind).toBe('decor');
      const g = kit.build({ seed: 4 });
      const tris = g.getAttribute('position').count / 3;
      expect(tris, id).toBeGreaterThan(40);
      expect(tris, id).toBeLessThan(2500);
      g.computeBoundingBox();
      const box = g.boundingBox!;
      // Small enough to sit in a tile, and standing on the ground.
      expect(box.max.x - box.min.x, id).toBeLessThan(1.1);
      expect(box.max.z - box.min.z, id).toBeLessThan(1.1);
      expect(box.min.y, id).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y, id).toBeGreaterThan(0.3);
    }
  });

  it('builds the same geometry twice, and something at the far level', () => {
    for (const id of [...VILLAGE, ...FINE]) {
      const kit = kitById.get(id)!;
      const a = kit.build({ seed: 9 });
      const b = kit.build({ seed: 9 });
      expect(Array.from(a.getAttribute('position').array), id).toEqual(
        Array.from(b.getAttribute('position').array),
      );
      expect(kit.build({ seed: 9, lod: 'low' }).getAttribute('position').count, id).toBeGreaterThan(0);
    }
  });

  it('reads the window flower swatch and leaves the seeded mix for mixed or nothing', () => {
    expect(customOf({ params: { windowFlowers: 'geranium' } }).windowFlowers).not.toBeNull();
    expect(customOf({ params: { windowFlowers: 'mixed' } }).windowFlowers).toBeNull();
    expect(customOf({}).windowFlowers).toBeNull();
    const colors = new Set(
      ['geranium', 'rose', 'cream', 'cornflower', 'buttercup'].map(
        (s) => customOf({ params: { windowFlowers: s } }).windowFlowers,
      ),
    );
    expect(colors.size).toBe(5);
  });

  it('draws window boxes in the chosen color on the cottage, and in the flower-boxes module', () => {
    const base = (c: string | null): KitBuildOptions => ({
      size: [2, 2],
      entrance: [0, 1],
      seed: 3,
      params: { windowBoxes: true, ...(c ? { windowFlowers: c } : {}) },
    });
    const kit = kitById.get('cottage')!;
    const colors = (o: KitBuildOptions): number[] => Array.from(kit.build(o).getAttribute('color').array);
    const sameCount = (o: KitBuildOptions): number => kit.build(o).getAttribute('position').count;
    const mixed = colors(base(null));
    const red = colors(base('geranium'));
    const blue = colors(base('cornflower'));
    // Same shape, different blooms: only the flower vertices change color.
    expect(sameCount(base('geranium'))).toBe(sameCount(base('cornflower')));
    expect(red).not.toEqual(blue);
    expect(red).not.toEqual(mixed);
    const changed = red.filter((v, i) => v !== blue[i]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(red.length / 4);
    // The module reads it too.
    const mod: KitBuildOptions = {
      ...base('cornflower'),
      params: { 'mod:wall': 'flower-boxes', windowFlowers: 'cornflower' },
    };
    const plain = kit.build(mod);
    const fitted = fitModules(plain, mod);
    expect(fitted.getAttribute('position').count).toBeGreaterThan(plain.getAttribute('position').count);
  });
});
