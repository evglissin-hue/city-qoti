// R3E: the static achievable check for R3 content (22-quality.md, Playability from the redesign):
// every content specialty and custom can be produced, every supplied piece's good has a maker or a
// neighbor, every outlet or well piece has a def to lean on. Content added later fails here, not in a playtest.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  customUnproducible,
  goodObtainable,
  specialtyUnproducible,
  supplyUnsuppliable,
  unproducibleContentPages,
} from '../../src/view/healthR3';

describe('R3 content can be produced', () => {
  it('every supplied decor piece can be supplied', () => {
    const supplied = content.decor.filter((d) => d.supply);
    expect(supplied.length).toBeGreaterThan(0);
    for (const d of supplied) expect(supplyUnsuppliable(d), d.id).toBeNull();
  });

  it('every supplied good has a maker the town can build or a neighbor that sells it', () => {
    for (const d of content.decor) {
      const g = d.supply?.good;
      if (g) expect(goodObtainable(g), `${d.id}: ${g}`).toBe(true);
    }
  });

  it('every specialty has a content pattern, a Treat flavor and a way to make it', () => {
    for (const s of content.specialties) expect(specialtyUnproducible(s), s.id).toBeNull();
  });

  it('every custom has its host, pattern or supply', () => {
    for (const c of content.customs) expect(customUnproducible(c), c.id).toBeNull();
  });

  it('no content page is unproducible', () => {
    expect(unproducibleContentPages()).toEqual([]);
  });

  it('every master good has a master who can make it', () => {
    for (const m of content.masters) {
      if (!m.good) continue;
      expect(content.goodById.has(m.good), m.of).toBe(true);
      expect(
        m.method?.outputs.some(([g]) => g === m.good),
        m.of,
      ).toBe(true);
      expect(content.tradeById.has(m.of) || content.buildingById.has(m.of), m.of).toBe(true);
    }
  });
});
