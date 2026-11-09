// P1: fuller, more varied trees: three mature shapes per species, cheap far levels.
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';

const SPECIES = ['oak', 'birch', 'pine'];
/** The seeds the trees layer builds its three mature variants from (render/layers/trees.ts). */
const seedOf = (species: number, v: number): number => 17 + v * 31 + species * 7;

describe('forest trees (P1)', () => {
  it('come in three distinct mature shapes per species', () => {
    SPECIES.forEach((id, i) => {
      const kit = kitById.get(id)!;
      const shapes = [0, 1, 2].map((v) => {
        const g = kit.build({ stage: 3, seed: seedOf(i + 1, v) });
        const b = g.boundingBox!;
        return { w: b.max.x - b.min.x, h: b.max.y, tris: g.getAttribute('position').count / 3 };
      });
      for (let a = 0; a < 3; a++)
        for (let b = a + 1; b < 3; b++) {
          const d = Math.abs(shapes[a]!.w - shapes[b]!.w) + Math.abs(shapes[a]!.h - shapes[b]!.h);
          expect(d, `${id} shapes ${a} and ${b}`).toBeGreaterThan(0.04);
        }
    });
  });

  it('keep the far level cheap and inside the near silhouette', () => {
    SPECIES.forEach((id, i) => {
      const kit = kitById.get(id)!;
      for (let v = 0; v < 3; v++) {
        const o = { stage: 3, seed: seedOf(i + 1, v) };
        const high = kit.build(o);
        const low = kit.build({ ...o, lod: 'low' });
        const th = high.getAttribute('position').count / 3;
        const tl = low.getAttribute('position').count / 3;
        expect(tl, `${id} ${v} far`).toBeLessThan(60);
        expect(th, `${id} ${v} near`).toBeLessThan(900);
        expect(tl, `${id} ${v}`).toBeLessThan(th / 4);
        expect(low.boundingBox!.max.y, `${id} ${v} height`).toBeLessThanOrEqual(
          high.boundingBox!.max.y + 0.08,
        );
        expect(low.boundingBox!.max.x, `${id} ${v} width`).toBeLessThanOrEqual(
          high.boundingBox!.max.x + 0.15,
        );
      }
    });
  });

  it('give oak clumps their own tints', () => {
    const g = kitById.get('oak')!.build({ stage: 3, seed: seedOf(1, 0) });
    const col = g.getAttribute('color');
    const pos = g.getAttribute('position');
    // Distinct green values among the canopy vertices (above the trunk).
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < 0.6) continue;
      seen.add([col.getX(i), col.getY(i), col.getZ(i)].map((c) => Math.round(c * 40)).join(','));
    }
    expect(seen.size).toBeGreaterThan(12);
  });

  it('keep young stages as they were (one shape, growing in place)', () => {
    for (const id of SPECIES) {
      const kit = kitById.get(id)!;
      for (let stage = 0; stage < 3; stage++) {
        const a = kit.build({ stage, seed: 24 });
        const b = kit.build({ stage, seed: 55 });
        expect(Array.from(a.getAttribute('position').array.slice(0, 30))).toEqual(
          Array.from(b.getAttribute('position').array.slice(0, 30)),
        );
      }
    }
  });
});
