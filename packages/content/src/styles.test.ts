import { describe, expect, it } from 'vitest';
import { content, styles, zones } from './index';

// District styles (C4B): the four starter styles, sorted, naming real zones, in clean words.
describe('district styles', () => {
  it('are the four starter styles, alphabetical, each suiting somewhere', () => {
    expect(styles.map((s) => s.id)).toEqual(['brick', 'plaster', 'stone', 'timber']);
    const zoneIds = new Set(zones.map((z) => z.id));
    for (const s of styles) {
      expect(content.styleById.get(s.id)).toBe(s);
      expect(s.name.length, s.id).toBeGreaterThan(0);
      expect(Object.keys(s.suits).length, s.id).toBeGreaterThan(0);
      for (const z of s.suits.zones ?? []) expect(zoneIds.has(z), `${s.id} ${z}`).toBe(true);
    }
  });

  it('writes without em or en dashes', () => {
    expect(JSON.stringify(styles)).not.toMatch(/—|–/);
  });
});
