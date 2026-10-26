// Forest trees (the map's tree layer), about one and a half world units tall when mature.
// `opts.stage` 0 (sapling) to 3 (mature, the default) scales and simplifies; `opts.lod` 'low' is a
// cheap version under 60 triangles with the same silhouette and colors; `opts.seed` picks a variant
// (canopy lumps, lean of the crown, hue).
//
// C3D-1: storybook trees. Oaks are broad, lumpy crowns of several clumps with sunlit tops; birches
// are slender white trunks with airy, tall crowns; pines are stacked, slightly drooping tiers.
import { mixHex, seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import type { Kit, KitBuildOptions } from './types';

const STAGE_SCALE = [0.32, 0.52, 0.76, 1];

function stageOf(opts: KitBuildOptions | undefined): number {
  const st = opts?.stage ?? 3;
  return Math.min(3, Math.max(0, Math.round(st)));
}

function finish(s: ShapeBuilder, opts: KitBuildOptions | undefined): ShapeBuilder {
  return s.scale(STAGE_SCALE[stageOf(opts)]!);
}

/** Sunlit top color for a leaf color. */
function sunlit(hex: number, k = 0.14): number {
  return mixHex(hex, 0xc8e070, k);
}

export const oak: Kit = {
  id: 'oak',
  kind: 'tree',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 7);
    const leaf = vary(palette.oakLeaf, rnd);
    const stage = stageOf(opts);
    const s = new ShapeBuilder();
    // The crown leans a touch to one side, different per variant.
    const la = rnd() * Math.PI * 2;
    const lx = Math.cos(la) * 0.05;
    const lz = Math.sin(la) * 0.05;
    if (opts?.lod === 'low') {
      s.cylinder(0, 0, 0.11, 0.07, 0, 0.62, palette.bark, 3);
      s.blob(lx, 1.0, lz, 0.6, 0.48, 0.6, leaf, 1, rnd, 0.07, sunlit(leaf));
      return finish(s, opts).build();
    }
    if (stage === 0) {
      s.cylinder(0, 0, 0.05, 0.03, 0, 0.7, palette.bark, 4);
      s.blob(0, 0.85, 0, 0.26, 0.24, 0.26, leaf, 0, rnd, 0.1, sunlit(leaf));
      return finish(s, opts).build();
    }
    s.cylinder(0, 0, 0.13, 0.075, 0, 0.62, palette.bark, 5);
    // A low bough reaching out under the crown.
    s.cylinder(0.05, 0, 0.035, 0.025, 0.42, 0.52, palette.bark, 3);
    s.blob(lx, 1.0, lz, 0.46, 0.37, 0.46, leaf, 1, rnd, 0.1, sunlit(leaf));
    if (stage >= 2) {
      // Three side clumps around the main crown and one on top.
      const a0 = rnd() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const a = a0 + (i / 3) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
        const r = 0.3 + rnd() * 0.08;
        const c = vary(leaf, rnd, 1.4);
        s.blob(
          lx + Math.cos(a) * r,
          0.86 + rnd() * 0.12,
          lz + Math.sin(a) * r,
          0.27,
          0.23,
          0.27,
          c,
          1,
          rnd,
          0.1,
          sunlit(c),
        );
      }
      const top = vary(mixHex(leaf, palette.birchLeaf, 0.3), rnd);
      s.blob(lx * 2, 1.27, lz * 2, 0.27, 0.21, 0.27, top, 1, rnd, 0.08, sunlit(top, 0.2));
    } else {
      s.blob(lx + 0.18, 0.9, lz, 0.22, 0.2, 0.22, vary(leaf, rnd), 1, rnd, 0.1, sunlit(leaf));
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
    const stage = stageOf(opts);
    const s = new ShapeBuilder();
    const la = rnd() * Math.PI * 2;
    const lx = Math.cos(la) * 0.04;
    const lz = Math.sin(la) * 0.04;
    if (opts?.lod === 'low') {
      s.cylinder(0, 0, 0.055, 0.04, 0, 0.95, palette.birchBark, 3);
      s.blob(lx, 1.14, lz, 0.32, 0.46, 0.32, leaf, 1, rnd, 0.08, sunlit(leaf));
      return finish(s, opts).build();
    }
    s.cylinder(0, 0, 0.06, 0.035, 0, 1.0, palette.birchBark, 5);
    // Dark bark marks.
    for (const y of [0.2, 0.47]) s.box(-0.062, y, -0.022, 0.062, y + 0.035, 0.022, palette.birchMark);
    s.blob(lx, 1.12, lz, 0.27, 0.42, 0.27, leaf, 1, rnd, 0.12, sunlit(leaf));
    if (stage >= 1) {
      const a = rnd() * Math.PI * 2;
      const c = vary(leaf, rnd, 1.6);
      s.blob(
        lx + Math.cos(a) * 0.15,
        0.9,
        lz + Math.sin(a) * 0.15,
        0.17,
        0.23,
        0.17,
        c,
        1,
        rnd,
        0.12,
        sunlit(c),
      );
    }
    if (stage >= 2) {
      const a = rnd() * Math.PI * 2;
      const c = vary(mixHex(leaf, 0xd9e27a, 0.25), rnd, 1.4);
      s.blob(
        lx * 2 + Math.cos(a) * 0.08,
        1.4,
        lz * 2 + Math.sin(a) * 0.08,
        0.16,
        0.2,
        0.16,
        c,
        1,
        rnd,
        0.1,
        sunlit(c, 0.18),
      );
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
    const stage = stageOf(opts);
    const low = opts?.lod === 'low';
    const s = new ShapeBuilder();
    s.cylinder(0, 0, 0.075, 0.05, 0, 0.36, palette.bark, low ? 3 : 5);
    // Tiers from the bottom up: wide and dark below, narrower and lighter above, each tilted a
    // little and turned so the edges do not line up.
    const tiers = low ? 2 : stage >= 2 ? 4 : stage === 1 ? 3 : 2;
    const seg = low ? 6 : 7;
    for (let t = 0; t < tiers; t++) {
      const k = t / Math.max(1, tiers - 1);
      const r = (low ? 0.5 : 0.5) - k * 0.26;
      const y0 = 0.26 + t * (1.05 / tiers);
      const h = (low ? 0.82 : 0.6) - k * 0.14;
      const col = vary(mixHex(green, mixHex(green, palette.birchLeaf, 0.3), k), rnd, 1.2);
      const ox = (rnd() - 0.5) * 0.04;
      const oz = (rnd() - 0.5) * 0.04;
      s.cylinder(ox, oz, r, 0, y0, y0 + h, col, seg, rnd() * Math.PI);
    }
    return finish(s, opts).build();
  },
};
