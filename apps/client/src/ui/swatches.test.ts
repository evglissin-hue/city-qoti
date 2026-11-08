// The Customize panel's swatch groups come from content's flat swatch list (once they did not).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { boostText, decorBoostLine } from './decorText';
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

describe('decor card text', () => {
  it('says what a piece does and for whom', () => {
    const rack = content.decorById.get('tool-rack')!;
    expect(boostText(rack)).toBe('+6% work at a sawpit, quarry, smithy or chopping shed within 2 tiles');
    expect(boostText(content.decorById.get('weathervane')!)).toBe(
      '+10% work at a windmill or water sawmill within 1 tile',
    );
    expect(boostText(content.decorById.get('bench')!)).toBeNull();
    expect(decorBoostLine(60, ['tool-rack'])).toBe('+6% work from the tool rack nearby');
  });
});
