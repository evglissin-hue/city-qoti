import { describe, expect, it } from 'vitest';
import { content } from './index';

const HABITATS = ['pollinator', 'wetland', 'hedgerow', 'woodland', 'meadow', 'garden'];

describe('nature content (C5C)', () => {
  it('has about thirty species, sorted, with sane rows', () => {
    const ids = content.wildlife.map((w) => w.id);
    expect(ids.length).toBeGreaterThanOrEqual(28);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(content.wildlife.map((w) => w.kind));
    for (const k of ['bird', 'insect', 'mammal', 'amphibian', 'fish'])
      expect(kinds.has(k as never)).toBe(true);
    for (const w of content.wildlife) {
      expect(w.habitats.length, w.id).toBeGreaterThan(0);
      for (const [h, min] of w.habitats) {
        expect(HABITATS, w.id).toContain(h);
        expect(min, w.id).toBeGreaterThan(0);
        expect(min, w.id).toBeLessThanOrEqual(255);
      }
      expect(w.seasons.length, w.id).toBeGreaterThan(0);
      for (const s of w.seasons) expect(s >= 0 && s <= 3, w.id).toBe(true);
      const [from, to] = w.hours;
      expect(from >= 0 && from < 24 && to > 0 && to <= 24 && from !== to, w.id).toBe(true);
      expect(w.rarity > 0 && w.rarity <= 1000, w.id).toBe(true);
      expect(w.hint, w.id).toBeTruthy();
      expect(w.flavor + (w.hint ?? ''), w.id).not.toMatch(/—/);
    }
  });

  it('never makes a resident species into wildlife', () => {
    for (const w of content.wildlife) {
      for (const s of content.species) expect(w.id.split('-'), w.id).not.toContain(s.id);
    }
  });

  it('has the six habitats in order and sources that name real things', () => {
    expect(content.habitats.map((h) => h.id)).toEqual(HABITATS);
    for (const s of content.habitatSources) {
      expect(HABITATS).toContain(s.habitat);
      if (s.from === 'decor')
        expect(
          content.decor.some((d) => d.tags.includes(s.ref)),
          s.ref,
        ).toBe(true);
      // R1: a business answers to its trade id as a tag (an orchard, hives).
      if (s.from === 'building')
        expect(
          content.buildings.some((b) => b.tags?.includes(s.ref)) || content.tradeById.has(s.ref),
          s.ref,
        ).toBe(true);
      if (s.from === 'module') expect(content.moduleById.has(s.ref), s.ref).toBe(true);
      if (s.from === 'site') expect(content.patternById.has(s.ref), s.ref).toBe(true);
    }
  });

  it('offers module slots only where a module fits, and costs real goods', () => {
    const slots = new Set(content.modules.map((m) => m.slot));
    for (const b of content.buildings)
      for (const [slot] of b.moduleSlots ?? []) expect(slots.has(slot), b.id).toBe(true);
    for (const m of content.modules)
      for (const [g] of m.cost?.goods ?? []) expect(content.goodById.has(g), m.id).toBe(true);
    for (const id of ['townhouse', 'herbalists-cottage', 'town-hall', 'tavern', 'stone-wall'])
      expect(content.buildingById.get(id)?.moduleSlots?.length, id).toBeGreaterThan(0);
  });
});
