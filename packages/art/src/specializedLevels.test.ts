// R3H: each level of a specialized building reads as more building (docs/build/cycle-r3h-specialized-levels.md,
// Task 4): level 2 differs from level 1 and level 3 from level 2, at both levels of detail; level 1 is
// exactly the build with no level; the budgets hold at every level.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { content } from '@qoti/content';
import { artKitId, kitById } from './kits';
import type { KitBuildOptions } from './kits/types';

/** The far budget every non-home kit keeps (levels.test.ts) and a ceiling for the near build. */
const FAR_BUDGET = 600;
const NEAR_BUDGET = 9000;

const defs = content.buildings.filter((b) => b.levels);

function optsOf(id: string, level: number | undefined, seed: number, lod?: 'low'): KitBuildOptions {
  const def = content.buildings.find((b) => b.id === id)!;
  const params: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(def.art.params ?? {}))
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') params[k] = v;
  if (def.placement?.some((r) => r.kind === 'waterEdge')) params.span = 3;
  if (level !== undefined) params.level = level;
  return { size: def.size, entrance: def.entrance, seed, params, ...(lod ? { lod } : {}) };
}

interface Shape {
  tris: number;
  box: [number, number, number, number, number, number];
  sum: number;
}

function shapeOf(g: BufferGeometry): Shape {
  const a = g.getAttribute('position');
  const box: Shape['box'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let sum = 0;
  for (let i = 0; i < a.count; i++) {
    const p = [a.getX(i), a.getY(i), a.getZ(i)] as const;
    for (let k = 0; k < 3; k++) {
      box[k] = Math.min(box[k]!, p[k]);
      box[k + 3] = Math.max(box[k + 3]!, p[k]);
    }
    sum += p[0] * 1.3 + p[1] * 2.7 + p[2] * 3.1;
  }
  return { tris: a.count / 3, box, sum: Math.round(sum * 1e4) };
}

function build(id: string, level: number | undefined, lod?: 'low', seed = 1): Shape {
  const def = content.buildings.find((b) => b.id === id)!;
  return shapeOf(kitById.get(artKitId(def.art))!.build(optsOf(id, level, seed, lod)));
}

const differs = (a: Shape, b: Shape): boolean =>
  a.tris !== b.tris || a.sum !== b.sum || a.box.some((v, i) => Math.abs(v - b.box[i]!) > 1e-6);

/** The silhouette's volume: grows when a level adds something tall or long. */
const volume = (s: Shape): number => (s.box[3] - s.box[0]) * (s.box[4] - s.box[1]) * (s.box[5] - s.box[2]);

describe('specialized building levels (R3H)', () => {
  it('cover every building that has levels', () => {
    expect(defs.length).toBeGreaterThanOrEqual(10);
  });

  for (const def of defs) {
    describe(def.id, () => {
      it('draws level 1 as it always was, and each level above as more', { timeout: 30000 }, () => {
        for (const lod of [undefined, 'low'] as const) {
          const none = build(def.id, undefined, lod);
          const l1 = build(def.id, 1, lod);
          const l2 = build(def.id, 2, lod);
          const l3 = build(def.id, 3, lod);
          expect(l1, `${def.id} ${lod ?? 'near'} level 1`).toEqual(none);
          expect(differs(l2, l1), `${def.id} ${lod ?? 'near'} 2 vs 1`).toBe(true);
          expect(differs(l3, l2), `${def.id} ${lod ?? 'near'} 3 vs 2`).toBe(true);
        }
      });

      it('grows at the far level too', () => {
        const l1 = build(def.id, 1, 'low');
        const l2 = build(def.id, 2, 'low');
        const l3 = build(def.id, 3, 'low');
        const grows = (a: Shape, b: Shape): boolean => b.tris > a.tris || volume(b) > volume(a) * 1.001;
        expect(grows(l1, l2), `${def.id} far 2 vs 1`).toBe(true);
        expect(grows(l2, l3), `${def.id} far 3 vs 2`).toBe(true);
      });

      it('keeps its budgets at every level and seed', { timeout: 30000 }, () => {
        for (const level of [1, 2, 3])
          for (let seed = 1; seed <= 4; seed++) {
            const far = build(def.id, level, 'low', seed);
            const near = build(def.id, level, undefined, seed);
            expect(far.tris, `${def.id} L${level} far`).toBeLessThanOrEqual(FAR_BUDGET);
            expect(near.tris, `${def.id} L${level} near`).toBeLessThanOrEqual(NEAR_BUDGET);
            expect(far.tris).toBeLessThan(near.tris);
          }
      });

      it('stays inside its lot', () => {
        const [w, d] = def.size;
        for (const level of [1, 2, 3]) {
          const b = build(def.id, level).box;
          expect(b[1], `${def.id} L${level} base`).toBeGreaterThanOrEqual(-0.4);
          // The footprint with the small overhangs the level 1 kits already have (awnings, jetties, roofs).
          expect(b[0], `${def.id} L${level} x-`).toBeGreaterThanOrEqual(-0.35);
          expect(b[3], `${def.id} L${level} x+`).toBeLessThanOrEqual(w + 0.35);
          expect(b[2], `${def.id} L${level} z-`).toBeGreaterThanOrEqual(-0.35);
          expect(b[5], `${def.id} L${level} z+`).toBeLessThanOrEqual(d + 0.45);
        }
      });
    });
  }
});
