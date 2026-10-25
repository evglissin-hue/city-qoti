// Placeholder decor: small colored primitives. Centered on the origin; linear pieces run along +x
// and span one tile (-0.5 to 0.5).
import { mixHex, seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import type { Kit, KitBuildOptions } from './types';

/** A small orchard tree: a sturdy trunk, a lumpy layered canopy and dots of fruit or blossom. */
function fruitTree(
  opts: KitBuildOptions | undefined,
  canopy: number,
  dot: number,
  petals: boolean,
): ShapeBuilder {
  const rnd = seeded(opts?.seed ?? 5);
  const leaf = vary(canopy, rnd);
  const s = new ShapeBuilder();
  s.cylinder(0, 0, 0.07, 0.05, 0, 0.46, palette.bark, 6);
  s.box(-0.015, 0.34, -0.015, 0.15, 0.38, 0.015, palette.bark);
  s.blob(0, 0.7, 0, 0.34, 0.27, 0.34, leaf, 1, rnd, 0.08);
  s.blob(0.2, 0.62, 0.1, 0.2, 0.17, 0.2, vary(leaf, rnd), 1, rnd, 0.08);
  s.blob(-0.16, 0.64, -0.12, 0.21, 0.18, 0.21, vary(leaf, rnd), 1, rnd, 0.08);
  s.blob(0.03, 0.88, 0.02, 0.2, 0.15, 0.2, vary(leaf, rnd, 1.5), 1, rnd, 0.06);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.6;
    const y = 0.58 + rnd() * 0.3;
    const r = 0.34 - Math.abs(y - 0.7) * 0.6;
    s.blob(Math.cos(a) * r, y, Math.sin(a) * r, 0.04, 0.04, 0.04, vary(dot, rnd, 0.5), 0);
  }
  if (petals) {
    // A few fallen petals on the grass.
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.15 + rnd() * 0.25;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      s.box(x - 0.02, 0, z - 0.015, x + 0.02, 0.006, z + 0.015, leaf);
    }
  }
  return s;
}

export const appleTree: Kit = {
  id: 'apple-tree',
  kind: 'decor',
  build: (opts) =>
    fruitTree(opts, mixHex(palette.oakLeaf, palette.birchLeaf, 0.4), palette.apple, false).build(),
};

export const barrels: Kit = {
  id: 'barrels',
  kind: 'decor',
  build: () =>
    new ShapeBuilder()
      .cylinder(-0.06, 0, 0.07, 0.07, 0, 0.18, palette.wood, 8)
      .cylinder(0.09, 0.04, 0.07, 0.07, 0, 0.18, palette.darkWood, 8)
      .cylinder(0.01, -0.1, 0.06, 0.06, 0, 0.15, palette.wood, 8)
      .build(),
};

export const bench: Kit = {
  id: 'bench',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 2);
    const wood = vary(palette.wood, rnd, 0.6);
    const s = new ShapeBuilder();
    // Side frames: leg panel, back post and arm rest. The back faces +z.
    for (const x of [-0.165, 0.135]) {
      s.rbox(x, 0, -0.05, x + 0.03, 0.1, 0.065, palette.timber, 0.008);
      s.box(x, 0.1, 0.045, x + 0.03, 0.25, 0.065, palette.timber);
      s.rbox(x - 0.005, 0.16, -0.055, x + 0.035, 0.18, 0.065, palette.timber, 0.008);
    }
    s.rbox(-0.18, 0.1, -0.055, 0.18, 0.12, -0.005, wood, 0.008);
    s.rbox(-0.18, 0.1, 0.0, 0.18, 0.12, 0.045, vary(wood, rnd, 0.5), 0.008);
    s.rbox(-0.17, 0.14, 0.045, 0.17, 0.18, 0.065, vary(wood, rnd, 0.5), 0.008);
    s.rbox(-0.17, 0.2, 0.045, 0.17, 0.24, 0.065, wood, 0.008);
    return s.build();
  },
};

export const cherryTree: Kit = {
  id: 'cherry-tree',
  kind: 'decor',
  build: (opts) => fruitTree(opts, palette.blossom, 0xfff1f4, true).build(),
};

export const crates: Kit = {
  id: 'crates',
  kind: 'decor',
  build: () =>
    new ShapeBuilder()
      .box(-0.13, 0, -0.08, 0.03, 0.15, 0.08, palette.wood)
      .box(0.02, 0, -0.06, 0.14, 0.12, 0.07, palette.darkWood)
      .box(-0.09, 0.15, -0.06, 0.03, 0.26, 0.06, palette.wood)
      .build(),
};

export const fence: Kit = {
  id: 'fence',
  kind: 'decor',
  build: () =>
    new ShapeBuilder()
      .box(-0.5, 0.1, -0.015, 0.5, 0.13, 0.015, palette.wood)
      .box(-0.5, 0.2, -0.015, 0.5, 0.23, 0.015, palette.wood)
      .box(-0.5, 0, -0.03, -0.44, 0.28, 0.03, palette.darkWood)
      .box(-0.03, 0, -0.03, 0.03, 0.28, 0.03, palette.darkWood)
      .box(0.44, 0, -0.03, 0.5, 0.28, 0.03, palette.darkWood)
      .build(),
};

export const flowerBed: Kit = {
  id: 'flower-bed',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 3);
    const s = new ShapeBuilder();
    // A stone edging around a mounded bed of soil with mixed blooms on leafy clumps.
    s.rbox(-0.23, 0, -0.17, 0.23, 0.045, 0.17, vary(palette.stone, rnd), 0.02);
    s.blob(0, 0.045, 0, 0.2, 0.04, 0.14, palette.soil, 1);
    const blooms = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD, palette.blossom];
    for (let i = 0; i < 12; i++) {
      const x = -0.15 + (i % 4) * 0.1 + (rnd() - 0.5) * 0.04;
      const z = -0.09 + Math.floor(i / 4) * 0.09 + (rnd() - 0.5) * 0.03;
      const y = 0.06 + 0.03 * (1 - Math.abs(x) / 0.2);
      s.blob(x, y, z, 0.04, 0.03, 0.04, vary(palette.leaf, rnd), 0);
      const c = blooms[Math.floor(rnd() * blooms.length)]!;
      s.blob(x + (rnd() - 0.5) * 0.02, y + 0.035, z, 0.028, 0.022, 0.028, c, 0);
    }
    return s.build();
  },
};
export const hedge: Kit = {
  id: 'hedge',
  kind: 'decor',
  build: () => new ShapeBuilder().box(-0.5, 0, -0.11, 0.5, 0.3, 0.11, palette.leaf).build(),
};

export const lantern: Kit = {
  id: 'lantern',
  kind: 'decor',
  build: () =>
    new ShapeBuilder()
      .cylinder(0, 0, 0.06, 0.05, 0, 0.05, palette.stone, 8)
      .cylinder(0, 0, 0.025, 0.02, 0.05, 0.5, palette.metal, 6)
      .box(-0.055, 0.49, -0.055, 0.055, 0.51, 0.055, palette.metal)
      .glow(1)
      .box(-0.042, 0.51, -0.042, 0.042, 0.6, 0.042, palette.lantern)
      .glow(0)
      .cylinder(0, 0, 0.075, 0, 0.6, 0.67, palette.metal, 4, Math.PI / 4)
      .blob(0, 0.68, 0, 0.012, 0.012, 0.012, palette.mustard, 0)
      .build(),
  anchors: () => ({ lights: [[0, 0.555, 0]] }),
};

export const lowWall: Kit = {
  id: 'low-wall',
  kind: 'decor',
  build: () => new ShapeBuilder().box(-0.5, 0, -0.08, 0.5, 0.18, 0.08, palette.stone).build(),
};

export const planter: Kit = {
  id: 'planter',
  kind: 'decor',
  build: () =>
    new ShapeBuilder()
      .box(-0.1, 0, -0.1, 0.1, 0.12, 0.1, palette.stone)
      .blob(0, 0.15, 0, 0.1, 0.07, 0.1, palette.leafLight)
      .build(),
};

export const signpost: Kit = {
  id: 'signpost',
  kind: 'decor',
  build: () =>
    new ShapeBuilder()
      .box(-0.02, 0, -0.02, 0.02, 0.45, 0.02, palette.darkWood)
      .box(-0.02, 0.32, -0.01, 0.2, 0.4, 0.01, palette.wood)
      .build(),
};
