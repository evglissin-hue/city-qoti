// V3B: a block of 24 joined homes within the I4 planning budget (docs/build/i4-visual-planning-notes.md,
// V2: about 3,000 triangles far and 70,000 near), and a joined row cheaper than the same homes apart.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { artKitId, kitById } from './kits';
import type { KitBuildOptions } from './kits/types';

/** The row: the grown homes a street fills with, in a mixed run, with storeys stepping by one. */
const KITS = ['cottage', 'townhouse', 'shop', 'townhouse', 'cottage', 'house'];
const STYLES = ['brick', 'plaster', 'stone', 'timber'];
const STOREYS = [1.5, 2, 3, 2, 1.5, 2];
const N = 24;

function cell(i: number, joined: boolean, storeys: boolean, lod: 'high' | 'low'): KitBuildOptions {
  const id = KITS[i % KITS.length]!;
  const def = content.buildings.find((b) => artKitId(b.art) === id);
  const params: Record<string, string | number | boolean> = {
    ...(def?.art.params ?? {}),
    style: STYLES[Math.floor(i / 6) % STYLES.length]!,
  };
  if (storeys) params.storeys = STOREYS[i % STOREYS.length]!;
  if (joined) {
    if (i > 0) params.joinL = KITS[(i - 1) % KITS.length]!;
    if (i < N - 1) params.joinR = KITS[(i + 1) % KITS.length]!;
  }
  return { size: [2, 2], entrance: [1, 1], seed: (i % 6) + 1, params, ...(lod === 'low' ? { lod } : {}) };
}

function rowTriangles(joined: boolean, storeys: boolean, lod: 'high' | 'low'): number {
  let n = 0;
  for (let i = 0; i < N; i++) {
    const id = KITS[i % KITS.length]!;
    n +=
      kitById
        .get(id)!
        .build(cell(i, joined, storeys, lod))
        .getAttribute('position').count / 3;
  }
  return n;
}

describe('a row of 24 joined homes (V3B budget)', () => {
  it('stays within about 3,000 triangles far and 70,000 near', { timeout: 60000 }, () => {
    const far = rowTriangles(true, true, 'low');
    const near = rowTriangles(true, true, 'high');
    console.info(`[rowBudget] 24 joined homes: far ${far}, near ${near}`);
    expect(far).toBeLessThanOrEqual(3000);
    expect(near).toBeLessThanOrEqual(70000);
  });

  it('costs less joined than the same homes apart', { timeout: 60000 }, () => {
    for (const lod of ['high', 'low'] as const) {
      const joined = rowTriangles(true, true, lod);
      const apart = rowTriangles(false, true, lod);
      console.info(`[rowBudget] ${lod}: joined ${joined}, apart ${apart}`);
      expect(joined).toBeLessThan(apart);
    }
  });
});
