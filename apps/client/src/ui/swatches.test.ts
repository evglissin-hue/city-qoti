// The Customize panel's swatch groups come from content's flat swatch list (once they did not).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { swatchGroups, swatchHex } from './swatches';

describe('swatchGroups', () => {
  it('lists every content swatch in its own group, with a color from the palette', () => {
    const g = swatchGroups();
    for (const group of ['wall', 'roof', 'roofMaterial', 'accent', 'flowers'] as const) {
      const want = content.swatches.filter((s) => s.group === group).map((s) => s.id);
      expect(
        g[group].map((s) => s.id),
        group,
      ).toEqual(want);
      for (const s of g[group]) expect(s.hex, `${group} ${s.id}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Content has seven walls (stone and brick too): the fallback list had five.
    expect(g.wall.map((s) => s.id)).toContain('brick');
    expect(g.flowers).toHaveLength(6);
    expect(g.flowers.map((s) => s.id)).toContain('mixed');
  });

  it('gives each flower color its own hex', () => {
    const hexes = swatchGroups().flowers.map((s) => s.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(swatchHex('flowers', 'geranium', '#000000')).not.toBe('#000000');
    expect(swatchHex('flowers', null, '#123456')).toBe('#123456');
  });
});
