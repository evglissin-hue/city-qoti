// Forest trees (the map's tree layer), about one and a half world units tall when mature.
// `opts.stage` 0 (sapling) to 3 (mature, the default) scales and simplifies; `opts.lod` 'low' is a
// cheap version under 60 triangles; `opts.seed` nudges hue and canopy lumps.
import { seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import type { Kit, KitBuildOptions } from './types';

const STAGE_SCALE = [0.35, 0.55, 0.78, 1];

function stageOf(opts: KitBuildOptions | undefined): number {
  const st = opts?.stage ?? 3;
  return Math.min(3, Math.max(0, Math.round(st)));
}

function finish(s: ShapeBuilder, opts: KitBuildOptions | undefined): ShapeBuilder {
  return s.scale(STAGE_SCALE[stageOf(opts)]!);
}

export const oak: Kit = {
  id: 'oak',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 7);
    const leaf = vary(palette.oakLeaf, rnd);
    const s = new ShapeBuilder();
    if (opts?.lod === 'low') {
      s.cylinder(0, 0, 0.09, 0.07, 0, 0.6, palette.bark, 4);
      s.blob(0, 0.98, 0, 0.5, 0.42, 0.5, leaf, 0);
      return finish(s, opts).build();
    }
    s.cylinder(0, 0, 0.11, 0.07, 0, 0.62, palette.bark, 6);
    s.box(-0.02, 0.45, -0.02, 0.22, 0.5, 0.02, palette.bark);
    s.blob(0, 0.98, 0, 0.44, 0.36, 0.44, leaf, 1, rnd, 0.08);
    if (stageOf(opts) >= 2) {
      s.blob(0.24, 0.86, 0.12, 0.26, 0.22, 0.26, vary(leaf, rnd), 1, rnd, 0.08);
      s.blob(-0.2, 0.9, -0.14, 0.27, 0.23, 0.27, vary(leaf, rnd), 1, rnd, 0.08);
      s.blob(0.04, 1.22, 0.02, 0.26, 0.2, 0.26, vary(palette.birchLeaf, rnd, 2), 1, rnd, 0.06);
    }
    return finish(s, opts).build();
  },
};

export const birch: Kit = {
  id: 'birch',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 11);
    const leaf = vary(palette.birchLeaf, rnd);
    const s = new ShapeBuilder();
    if (opts?.lod === 'low') {
      s.cylinder(0, 0, 0.05, 0.04, 0, 0.85, palette.birchBark, 4);
      s.blob(0, 1.12, 0, 0.28, 0.42, 0.28, leaf, 0);
      return finish(s, opts).build();
    }
    s.cylinder(0, 0, 0.055, 0.04, 0, 0.9, palette.birchBark, 6);
    for (const y of [0.22, 0.43, 0.66]) s.box(-0.056, y, -0.02, 0.056, y + 0.03, 0.02, palette.birchMark);
    s.blob(0, 1.1, 0, 0.27, 0.4, 0.27, leaf, 1, rnd, 0.1);
    if (stageOf(opts) >= 2) {
      s.blob(0.14, 0.92, 0.06, 0.16, 0.2, 0.16, vary(leaf, rnd, 2), 1, rnd, 0.1);
      s.blob(-0.1, 1.32, -0.05, 0.15, 0.18, 0.15, vary(leaf, rnd, 2), 1, rnd, 0.1);
    }
    return finish(s, opts).build();
  },
};

export const pine: Kit = {
  id: 'pine',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 13);
    const green = vary(palette.pine, rnd);
    const s = new ShapeBuilder();
    const seg = opts?.lod === 'low' ? 5 : 7;
    s.cylinder(0, 0, 0.07, 0.06, 0, 0.35, palette.bark, opts?.lod === 'low' ? 4 : 6);
    const tiers = opts?.lod === 'low' ? 2 : stageOf(opts) >= 2 ? 3 : 2;
    for (let t = 0; t < tiers; t++) {
      const k = t / Math.max(1, tiers - 1);
      const r = 0.46 - k * 0.2;
      const y0 = 0.28 + t * (1.0 / tiers);
      const col = t % 2 === 0 ? green : vary(green, rnd, 1.5);
      s.cylinder(0, 0, r, 0, y0, y0 + 0.62 - k * 0.12, col, seg, t * 0.4);
    }
    return finish(s, opts).build();
  },
};
