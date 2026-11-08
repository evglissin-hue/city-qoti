// C5E: modules fit any home kit at both levels.
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';
import { EXTRA_FLOOR, fitModules, fitOf } from './kits/modules';
import type { KitBuildOptions } from './kits/types';

const MODULES: [string, string][] = [
  ['front', 'porch'],
  ['front', 'arcade'],
  ['side', 'bay-window'],
  ['side', 'balcony'],
  ['roof', 'dormer'],
  ['top', 'extra-floor'],
  ['top', 'tower'],
  ['wall', 'flower-boxes'],
  ['wall', 'ivy'],
];
const KITS: [string, [number, number], [number, number]][] = [
  ['townhouse', [2, 2], [0, 1]],
  ['cottage', [2, 2], [0, 1]],
  ['tavern', [3, 3], [1, 2]],
  ['herbalists-cottage', [2, 2], [1, 1]],
];

const tris = (g: { getAttribute(n: string): { count: number } }): number =>
  g.getAttribute('position').count / 3;

describe('modules (C5E)', () => {
  it('read walls, eave and ridge from every home kit', () => {
    for (const [id, size, entrance] of KITS) {
      const fit = fitOf(kitById.get(id)!.build({ size, entrance, seed: 3 }));
      expect(fit, id).not.toBeNull();
      expect(fit!.x1 - fit!.x0, id).toBeGreaterThan(0.8);
      expect(fit!.ridge, id).toBeGreaterThan(fit!.eave);
    }
  });

  it('add to the kit at both levels with the same attributes, the far level no bigger', () => {
    for (const [id, size, entrance] of KITS) {
      for (const [slot, m] of MODULES) {
        const opts: KitBuildOptions = { size, entrance, seed: 2, params: { [`mod:${slot}`]: m } };
        const kit = kitById.get(id)!;
        const high = kit.build(opts);
        const low = kit.build({ ...opts, lod: 'low' });
        const fh = fitModules(high, opts);
        const fl = fitModules(low, { ...opts, lod: 'low' });
        expect(tris(fh), `${id} ${m}`).toBeGreaterThan(tris(high));
        expect(tris(fl), `${id} ${m} low`).toBeLessThanOrEqual(tris(fh));
        expect(Object.keys(fl.attributes).sort(), `${id} ${m}`).toEqual(Object.keys(fh.attributes).sort());
        expect(tris(fh) - tris(high), `${id} ${m} budget`).toBeLessThan(1200);
      }
    }
  });

  it('raise the roof a storey for an extra floor', () => {
    const opts: KitBuildOptions = {
      size: [2, 2],
      entrance: [0, 1],
      seed: 1,
      params: { 'mod:top': 'extra-floor' },
    };
    const base = kitById.get('cottage')!.build(opts);
    base.computeBoundingBox();
    const g = fitModules(base, opts);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(base.boundingBox!.max.y + EXTRA_FLOOR, 3);
  });
});
