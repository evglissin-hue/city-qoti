// P1 (the dead-end hunt): the audit found Quiet, Please offered eleven times and never granted, since
// nothing but moving the noise helped. Hedges, walls and mature trees right beside a tile now muffle
// its noise, up to nearly half, so a household troubled by a workshop has a gentler remedy. R1: a
// Forester's Lodge makes the noise the sawpit made.
import { describe, expect, it } from 'vitest';
import { charm, decor, settle, standardWorld, build, tree } from '../hearth/helpers';

describe('noise is muffled by what stands beside it', () => {
  it('hedges beside a tile take some of the workshop noise off it', () => {
    const open = standardWorld();
    const hedged = standardWorld();
    for (const w of [open, hedged]) build(w, 'foresters-lodge', 130, 40);
    for (const [x, z] of [
      [130, 44],
      [131, 44],
      [132, 44],
    ] as const)
      decor(hedged, 'hedge', x, z);
    settle(open);
    settle(hedged);
    const loud = charm(open, 'charmNoise', 131, 43);
    const soft = charm(hedged, 'charmNoise', 131, 43);
    expect(loud).toBeGreaterThan(0);
    expect(soft).toBeLessThan(loud);
    // Three pieces beside the tile: 45% off, at most (rounding aside).
    expect(soft).toBeGreaterThanOrEqual(Math.floor(loud * 0.55) - 1);
  });

  it('mature trees muffle too, saplings do not', () => {
    const open = standardWorld();
    const trees = standardWorld();
    const saplings = standardWorld();
    for (const w of [open, trees, saplings]) build(w, 'foresters-lodge', 130, 40);
    for (const [x, z] of [
      [130, 44],
      [132, 44],
    ] as const) {
      tree(trees, x, z, 3);
      tree(saplings, x, z, 1);
    }
    for (const w of [open, trees, saplings]) settle(w);
    const loud = charm(open, 'charmNoise', 131, 43);
    expect(charm(trees, 'charmNoise', 131, 43)).toBeLessThan(loud);
    expect(charm(saplings, 'charmNoise', 131, 43)).toBe(loud);
  });
});
