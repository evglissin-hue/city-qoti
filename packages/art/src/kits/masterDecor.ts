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
 * A garden ornament a stonemason signs a town with: a carved stone ball, banded with raised rings
 * and a wound ridge, resting on a short square pedestal with a molded top.
 */
export const carvedStone: Kit = {
  id: 'carved-stone',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 33);
    const stone = vary(DRESSED, rnd, 0.35);
    const relief = mixHex(stone, palette.plasterCream, 0.4);
    const shade = mixHex(stone, palette.foundation, 0.18);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const R = 0.15;
    const cy = 0.4;
    const segs = 10;
    s.surface(SURFACE.plain);
    s.levels(
      () => {
        // The pedestal: a footing, a square shaft, and a molded top with a lip and a cap.
        s.rbox(-0.16, 0, -0.16, 0.16, 0.045, 0.16, palette.foundation, 0.01);
        s.rbox(-0.115, 0.045, -0.115, 0.115, 0.2, 0.115, shade, 0.008);
        s.rbox(-0.14, 0.2, -0.14, 0.14, 0.235, 0.14, vary(stone, rnd, 0.3), 0.01);
        s.rbox(-0.12, 0.235, -0.12, 0.12, 0.255, 0.12, relief, 0.008);
        // The ball: rings from pole to pole, with two raised bands (relief) that taper into the stone.
        const prof: [number, number, boolean][] = [
          [-90, 1, false],
          [-62, 1, false],
          [-44, 1.0, false],
          [-38, 1.07, true],
          [-30, 1.07, true],
          [-24, 1.0, false],
          [-9, 1.0, false],
          [-4, 1.06, true],
          [4, 1.06, true],
          [9, 1.0, false],
          [24, 1.0, false],
          [30, 1.07, true],
          [38, 1.07, true],
          [44, 1.0, false],
          [62, 1, false],
          [90, 1, false],
        ];
        const ring = (i: number, j: number): [number, number, number] => {
          const [phi, k] = prof[i]!;
          const ph = (phi * Math.PI) / 180;
          const a = (j / segs) * Math.PI * 2 + (i % 2) * 0.1;
          const rr = Math.cos(ph) * R * k;
          return [Math.cos(a) * rr, cy + Math.sin(ph) * R * k, Math.sin(a) * rr];
        };
        const norm = (p: [number, number, number]): [number, number, number] => {
          const x = p[0];
          const y = p[1] - cy;
          const z = p[2];
          const l = Math.hypot(x, y, z) || 1;
          return [x / l, y / l, z / l];
        };
        for (let i = 0; i < prof.length - 1; i++) {
          const banded = prof[i]![2] || prof[i + 1]![2];
          const hex = banded ? relief : stone;
          for (let j = 0; j < segs; j++) {
            const a = ring(i, j);
            const b = ring(i, j + 1);
            const c = ring(i + 1, j + 1);
            const d = ring(i + 1, j);
            const mid: [number, number, number] = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
            // The pole rows are fans: aim them from the middle of the triangle, not of a diagonal.
            const pole = (
              p: [number, number, number],
              q: [number, number, number],
              r: [number, number, number],
            ) => norm([(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3, (p[2] + q[2] + r[2]) / 3]);
            if (i === 0) s.tri(a, c, d, hex, pole(a, c, d));
            else if (i === prof.length - 2) s.tri(a, b, d, hex, pole(a, b, d));
            else s.quad(a, b, c, d, hex, norm(mid));
          }
        }
      },
      () => {
        farBox(s, -0.16, 0, -0.16, 0.16, 0.255, 0.16, shade, 'b');
        s.blob(0, cy, 0, R, R, R, stone, 0);
      },
    );
    return s.build();
  },
};

/**
 * A tree a gardener has shaped: two clipped rounds and a little ball on a straight, clean stem in a
 * stone tub, the crowns smooth and tight where a wild tree is ragged. R3X: a topiary of box, an
 * evergreen, so it stays this green all year (unlike the ornamental cherry, `cherry-tree`, whose
 * crown follows the calendar through `params.leaf`).
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
        s.cylinder(0, 0, 0.02, 0.02, 0.15, 0.62, stem, 5);
        // Two clipped rounds and a ball on the straight stem, each smooth and tight, lit from the top.
        const tier = (y: number, r: number, h: number, hex: number): void => {
          s.blob(0, y, 0, r, h, r, hex, 1, undefined, 0, mixHex(hex, 0x9ac060, 0.28));
        };
        tier(0.33, 0.175, 0.14, mixHex(leaf, 0x2e4a24, 0.2));
        tier(0.58, 0.115, 0.1, leaf);
        s.blob(0, 0.74, 0, 0.05, 0.05, 0.05, mixHex(leaf, 0x7fae4e, 0.3), 0);
      },
      () => {
        farCylinder(s, 0, 0, 0.14, 0.15, 0, 0.15, tubStone, 6);
        s.cylinder(0, 0, 0.02, 0.02, 0.15, 0.4, stem, 4);
        s.blob(0, 0.47, 0, 0.17, 0.32, 0.17, leaf, 0);
      },
    );
    return s.build();
  },
};
