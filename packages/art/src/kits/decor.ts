// Placeholder decor: small colored primitives. Centered on the origin; linear pieces run along +x
// and span one tile (-0.5 to 0.5).
import { ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import type { Kit } from './types';

function tree(canopy: number, accent: number | null): ShapeBuilder {
  const s = new ShapeBuilder();
  s.cylinder(0, 0, 0.06, 0.05, 0, 0.45, palette.bark, 6);
  s.blob(0, 0.68, 0, 0.36, 0.3, 0.36, canopy);
  if (accent !== null) {
    s.blob(0.18, 0.62, 0.22, 0.05, 0.05, 0.05, accent);
    s.blob(-0.2, 0.7, 0.05, 0.05, 0.05, 0.05, accent);
    s.blob(0.05, 0.58, -0.25, 0.05, 0.05, 0.05, accent);
  }
  return s;
}

export const appleTree: Kit = {
  id: 'apple-tree',
  kind: 'decor',
  build: () => tree(palette.leaf, palette.apple).build(),
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
  build: () =>
    new ShapeBuilder()
      .box(-0.17, 0.09, -0.05, 0.17, 0.12, 0.05, palette.wood)
      .box(-0.17, 0.12, 0.04, 0.17, 0.24, 0.06, palette.wood)
      .box(-0.15, 0, -0.04, -0.13, 0.09, 0.04, palette.darkWood)
      .box(0.13, 0, -0.04, 0.15, 0.09, 0.04, palette.darkWood)
      .build(),
};

export const cherryTree: Kit = {
  id: 'cherry-tree',
  kind: 'decor',
  build: () => tree(palette.blossom, palette.flowerA).build(),
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
  build: () => {
    const s = new ShapeBuilder().box(-0.22, 0, -0.16, 0.22, 0.05, 0.16, palette.soil);
    const colors = [palette.flowerA, palette.flowerB, palette.flowerC];
    for (let i = 0; i < 9; i++) {
      const x = -0.15 + (i % 3) * 0.15;
      const z = -0.1 + Math.floor(i / 3) * 0.1;
      s.blob(x, 0.08, z, 0.035, 0.03, 0.035, colors[i % 3]!);
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
