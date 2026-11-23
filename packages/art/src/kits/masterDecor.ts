// R3X: the two pieces masters bring (content masterDecor.ts), drawn as themselves where they borrowed
// the millstone bench and the cherry tree. House style as decor.ts and fineDecor.ts: chunky,
// flat-shaded, gently beveled, centered on the origin, a half tile across at most, facing +z.
import { mixHex, seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { SURFACE } from '../surface';
import { farBox, farCylinder } from './decorFar';
import type { Kit } from './types';

/** A quarryman's stone: the pale, warm dressed face of a block that has seen a chisel. */
const DRESSED = mixHex(palette.stone, palette.plasterButter, 0.22);

/**
 * A standing stone on a low plinth, dressed square, its front carved: a spiral and a band of raised
 * lozenges above the plinth. The sort of thing a master quarryman signs a town with.
 */
export const carvedStone: Kit = {
  id: 'carved-stone',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 33);
    const stone = vary(DRESSED, rnd, 0.35);
    const groove = mixHex(stone, palette.foundation, 0.55);
    const relief = mixHex(stone, palette.plasterCream, 0.45);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const front = 0.056;
    s.surface(SURFACE.plain);
    s.levels(
      () => {
        // A two-step plinth, the lower step a little weathered.
        s.rbox(-0.2, 0, -0.14, 0.2, 0.04, 0.14, palette.foundation, 0.01);
        s.rbox(-0.17, 0.04, -0.115, 0.17, 0.07, 0.115, vary(palette.stone, rnd, 0.4), 0.008);
        // The stone: a dressed shaft with a shoulder and a flat cap.
        s.rbox(-0.1, 0.07, -0.056, 0.1, 0.35, front, stone, 0.012);
        s.rbox(-0.082, 0.35, -0.046, 0.082, 0.4, 0.046, mixHex(stone, palette.plasterCream, 0.15), 0.012);
        // The spiral, a groove two thin strips wide, wound out from the middle of the face.
        const cx = 0;
        const cy = 0.235;
        const turns = 2.25;
        const n = 26;
        const z = front + 0.0012;
        let prev: [number, number] | null = null;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * turns * Math.PI * 2;
          const r = 0.008 + (i / n) * 0.058;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (prev) {
            const [px, py] = prev;
            // A strip of constant width, nudged along the radius at each end.
            const w = 0.0085;
            const dx = x - px;
            const dy = y - py;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * w;
            const ny = (dx / len) * w;
            s.quad(
              [px - nx, py - ny, z],
              [px + nx, py + ny, z],
              [x + nx, y + ny, z],
              [x - nx, y - ny, z],
              groove,
              [0, 0, 1],
            );
          }
          prev = [x, y];
        }
        // A band of raised lozenges above the plinth.
        for (let i = 0; i < 5; i++) {
          const x = -0.064 + i * 0.032;
          const zz = front + 0.0016;
          s.quad(
            [x, 0.105, zz],
            [x + 0.014, 0.12, zz],
            [x, 0.135, zz],
            [x - 0.014, 0.12, zz],
            relief,
            [0, 0, 1],
          );
        }
        // Chisel marks along both edges of the shaft: a thin line of the groove tone.
        for (const x of [-0.092, 0.086])
          s.box(x, 0.09, front - 0.002, x + 0.006, 0.33, front + 0.001, groove);
      },
      () => {
        farBox(s, -0.2, 0, -0.14, 0.2, 0.07, 0.14, palette.foundation, 'b');
        farBox(s, -0.1, 0.07, -0.056, 0.1, 0.4, front, stone, 'b');
      },
    );
    return s.build();
  },
};

/**
 * A tree a gardener has shaped: three clipped tiers on a straight, clean stem in a stone tub, the
 * crowns round and tight where a wild tree is ragged. A cheery little ball tops it.
 */
export const ornamentalTree: Kit = {
  id: 'ornamental-tree',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 34);
    const leaf = vary(0x56853a, rnd, 0.4);
    const tubStone = vary(palette.stone, rnd, 0.3);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const stem = mixHex(palette.bark, palette.wood, 0.3);
    s.levels(
      () => {
        // The tub: a tapered drum with a lip and a ring of darker stone, soil showing at the top.
        s.cylinder(0, 0, 0.13, 0.15, 0, 0.12, tubStone, 8, Math.PI / 8);
        s.cylinder(
          0,
          0,
          0.16,
          0.16,
          0.12,
          0.145,
          mixHex(tubStone, palette.plasterCream, 0.25),
          8,
          Math.PI / 8,
        );
        s.cylinder(0, 0, 0.135, 0.135, 0.145, 0.15, 0x5a4434, 8);
        s.cylinder(0, 0, 0.152, 0.152, 0.05, 0.06, mixHex(tubStone, palette.foundation, 0.5), 8, Math.PI / 8);
        // The stem, straight and clean to the first tier.
        s.cylinder(0, 0, 0.02, 0.02, 0.15, 0.46, stem, 5);
        // Three clipped tiers and a ball, each a smooth flattened round, lit alike from the top.
        const tier = (y: number, r: number, h: number, hex: number): void => {
          s.blob(0, y, 0, r, h, r, hex, 1, undefined, 0, mixHex(hex, 0x9ac060, 0.28));
        };
        tier(0.34, 0.18, 0.09, mixHex(leaf, 0x2e4a24, 0.2));
        tier(0.5, 0.14, 0.085, leaf);
        tier(0.64, 0.1, 0.08, mixHex(leaf, 0x7fae4e, 0.15));
        s.blob(0, 0.76, 0, 0.045, 0.045, 0.045, mixHex(leaf, 0x7fae4e, 0.3), 0);
      },
      () => {
        farCylinder(s, 0, 0, 0.14, 0.15, 0, 0.15, tubStone, 6);
        s.cylinder(0, 0, 0.02, 0.02, 0.15, 0.4, stem, 4);
        s.blob(0, 0.5, 0, 0.17, 0.3, 0.17, leaf, 0);
      },
    );
    return s.build();
  },
};
