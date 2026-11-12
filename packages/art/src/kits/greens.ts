// C5E: the decor the I3 nature patterns unlock (content/natureDecor.ts): an arbor seat under
// climbing roses, a pear tree, a reed bed for a pond's edge, a see-saw and a rope swing on a frame.
// Centered on the origin, surface ids on every face.
import { brushDabs, type DabBlob } from '../dabs';
import { mixHex, seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import { fruitTree } from './decor';
import { FLOWERS } from './style';
import type { Kit } from './types';

export const arborSeat: Kit = {
  id: 'arbor-seat',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 157);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const wood = vary(palette.plasterCream, rnd, 0.4);
    // A white-painted arbor, a bench inside (back to -z), roses climbing the trellis and the arch.
    s.surface(SURFACE.timber);
    for (const x of [-0.22, 0.22])
      for (const z of [-0.12, 0.08]) s.box(x - 0.014, 0, z - 0.014, x + 0.014, 0.5, z + 0.014, wood);
    for (let i = 0; i < 7; i++) {
      const a0 = (i / 7) * Math.PI;
      const a1 = ((i + 1) / 7) * Math.PI;
      for (const z of [-0.12, 0.08])
        beam(
          s,
          [-Math.cos(a0) * 0.22, 0.5 + Math.sin(a0) * 0.12, z],
          [-Math.cos(a1) * 0.22, 0.5 + Math.sin(a1) * 0.12, z],
          0.012,
          wood,
        );
    }
    s.box(-0.2, 0.11, -0.1, 0.2, 0.13, 0.02, vary(palette.wood, rnd, 0.4));
    s.box(-0.2, 0.13, -0.12, 0.2, 0.27, -0.1, vary(palette.wood, rnd, 0.4));
    s.surface(SURFACE.leaf);
    s.levels(
      () => {
        for (let i = 0; i < 9; i++) {
          const side = i % 2 ? 1 : -1;
          const y = 0.08 + rnd() * 0.5;
          const x = y > 0.5 ? (rnd() - 0.5) * 0.4 : side * 0.24;
          s.blob(x, y, -0.02 + (rnd() - 0.5) * 0.2, 0.05, 0.045, 0.05, vary(palette.leaf, rnd, 0.7), 0);
        }
        s.surface(SURFACE.flowers);
        for (let i = 0; i < 10; i++) {
          const side = i % 2 ? 1 : -1;
          const y = 0.12 + rnd() * 0.52;
          const x = y > 0.5 ? (rnd() - 0.5) * 0.4 : side * 0.25;
          s.blob(x, y, -0.02 + (rnd() - 0.5) * 0.2, 0.022, 0.02, 0.022, rnd() < 0.6 ? 0xe9707a : 0xf2b8c6, 0);
        }
      },
      () => {
        s.box(-0.27, 0.05, -0.13, -0.19, 0.6, 0.09, palette.leaf);
        s.box(0.19, 0.05, -0.13, 0.27, 0.6, 0.09, palette.leaf);
      },
    );
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const pearTree: Kit = {
  id: 'pear-tree',
  kind: 'decor',
  build: (opts) => {
    const s = fruitTree(opts, mixHex(palette.oakLeaf, palette.birchLeaf, 0.6), 0xc9c25a, false);
    return s.build();
  },
};

export const reedBed: Kit = {
  id: 'reed-bed',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 163);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // A damp hollow of reeds and yellow flag irises, cattails standing up out of it.
    s.surface(SURFACE.dirt);
    s.blob(0, 0.013, 0, 0.26, 0.012, 0.2, 0x6b5a3e, 0);
    s.surface(SURFACE.leaf);
    s.levels(
      () => {
        // V2B: two or three upright tussocks of dabs, their strokes standing up.
        const clumps = 2 + Math.floor(rnd() * 2.999);
        const blobs: DabBlob[] = [];
        for (let i = 0; i < clumps; i++) {
          const a = ((i + rnd() * 0.6) / clumps) * Math.PI * 2;
          const r = 0.05 + rnd() * 0.12;
          const cx = Math.cos(a) * r;
          const cz = Math.sin(a) * r * 0.8;
          blobs.push({
            center: [cx, 0.19, cz],
            radii: [0.08, 0.12, 0.08],
            normalFrom: [cx, 0.02, cz],
            color: vary(0x7f9a52, rnd, 1.2),
          });
        }
        brushDabs(s, blobs, {
          count: 42,
          size: 0.075,
          tintSpread: 0.25,
          skyLighten: 0.5,
          gaps: 0,
          thin: 1,
          seed: Math.floor((opts?.seed ?? 163) * 31 + 7),
          lift: 1,
          stretch: 2.4,
        });
        for (let i = 0; i < 4; i++) {
          const x = (rnd() - 0.5) * 0.3;
          const z = (rnd() - 0.5) * 0.24;
          const h = 0.3 + rnd() * 0.1;
          s.cylinder(x, z, 0.005, 0.005, 0, h, 0x7f9a52, 3);
          s.cylinder(x, z, 0.016, 0.014, h, h + 0.07, 0x6b4a30, 4);
        }
        s.surface(SURFACE.flowers);
        for (let i = 0; i < 4; i++)
          s.blob(
            (rnd() - 0.5) * 0.34,
            0.2 + rnd() * 0.06,
            (rnd() - 0.5) * 0.26,
            0.02,
            0.018,
            0.02,
            0xf3d35b,
            0,
          );
      },
      () => void s.cylinder(0, 0, 0.2, 0.14, 0, 0.3, 0x7f9a52, 6),
    );
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const seeSaw: Kit = {
  id: 'see-saw',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 167);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const paint = vary([0xe9707a, 0x8fb8d9, 0xf3d35b][Math.floor(rnd() * 3)]!, rnd, 0.3);
    // A plank on a painted pivot, tipped down at one end, handles at both.
    s.surface(SURFACE.timber);
    s.box(-0.04, 0, -0.05, 0.04, 0.12, 0.05, paint);
    beam(s, [-0.34, 0.03, 0], [0.34, 0.2, 0], 0.03, vary(palette.wood, rnd, 0.4));
    for (const [x, y] of [
      [-0.27, 0.05],
      [0.27, 0.19],
    ] as const) {
      beam(s, [x, y, -0.04], [x, y + 0.08, -0.04], 0.008, palette.metal);
      beam(s, [x, y, 0.04], [x, y + 0.08, 0.04], 0.008, palette.metal);
      beam(s, [x, y + 0.08, -0.04], [x, y + 0.08, 0.04], 0.008, palette.metal);
    }
    s.surface(SURFACE.dirt);
    s.blob(-0.32, 0.004, 0, 0.08, 0.004, 0.08, 0x9a7a52, 0);
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const swing: Kit = {
  id: 'swing',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 173);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // An A-frame of logs, a crossbar, two ropes and a seat; flowers at the frame's feet.
    s.surface(SURFACE.timber);
    for (const x of [-0.26, 0.26]) {
      beam(s, [x, 0.02, -0.14], [x, 0.62, 0], 0.022, vary(palette.wood, rnd, 0.4));
      beam(s, [x, 0.02, 0.14], [x, 0.62, 0], 0.022, vary(palette.wood, rnd, 0.4));
    }
    beam(s, [-0.3, 0.62, 0], [0.3, 0.62, 0], 0.024, palette.darkWood);
    s.surface(SURFACE.plain);
    for (const x of [-0.09, 0.09]) beam(s, [x, 0.61, 0], [x, 0.16, 0], 0.004, 0xbfa27a);
    s.surface(SURFACE.timber);
    s.box(-0.11, 0.14, -0.04, 0.11, 0.165, 0.04, vary(0x8fb8d9, rnd, 0.3));
    s.surface(SURFACE.flowers);
    s.nearOnly(() => {
      for (const x of [-0.26, 0.26])
        for (const z of [-0.15, 0.15])
          s.blob(x, 0.03, z, 0.035, 0.03, 0.035, FLOWERS[Math.floor(rnd() * FLOWERS.length)]!, 0);
    });
    s.surface(SURFACE.plain);
    return s.build();
  },
};
