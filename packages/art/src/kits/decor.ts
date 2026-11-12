// Placeholder decor: small colored primitives. Centered on the origin; linear pieces run along +x
// and span one tile (-0.5 to 0.5).
import { brushDabs, dabTint, type DabBlob } from '../dabs';
import { mixHex, seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { SURFACE } from '../surface';
import { farBox, farCylinder } from './decorFar';
import { CORE_SHADE, toward } from './trees';
import type { Kit, KitBuildOptions } from './types';

/** A small orchard tree: a sturdy trunk, a lumpy layered canopy and dots of fruit or blossom. */
export function fruitTree(
  opts: KitBuildOptions | undefined,
  canopy: number,
  dot: number,
  petals: boolean,
): ShapeBuilder {
  const rnd = seeded(opts?.seed ?? 5);
  const leaf = vary(canopy, rnd);
  // V1B: the far level is the trunk and one round crown (fruit, petals and the bough drop out).
  const s = new ShapeBuilder(opts?.lod ?? 'high');
  s.cylinder(0, 0, 0.07, 0.05, 0, 0.46, palette.bark, 6);
  s.box(-0.015, 0.34, -0.015, 0.15, 0.38, 0.015, palette.bark);
  // V2B: near, the crown is brush dabs (`dabs.ts`) over a deeper core, its clumps shading as one
  // mass from the crown's heart; far, the one round crown lit a little toward the sky with the
  // dabs' tint. Blossom crowns (the cherry) keep a pink core rather than a green one.
  const seed = opts?.seed ?? 5;
  const blobs: DabBlob[] = [
    { center: [0, 0.7, 0], radii: [0.34, 0.27, 0.34], color: leaf },
    { center: [0.2, 0.62, 0.1], radii: [0.2, 0.17, 0.2], color: vary(leaf, rnd) },
    { center: [-0.16, 0.64, -0.12], radii: [0.21, 0.18, 0.21], color: vary(leaf, rnd) },
    { center: [0.03, 0.88, 0.02], radii: [0.2, 0.15, 0.2], color: vary(leaf, rnd, 1.5) },
  ];
  const shade = petals ? 0x5a3a46 : CORE_SHADE;
  s.levels(
    () => {
      const crnd = seeded(seed * 7 + 2);
      // The main clump's core round, the small ones' cheap (they hide under the dabs).
      blobs.forEach((bl, i) => {
        const [rx, ry, rz] = bl.radii;
        const [cx, cy, cz] = bl.center;
        const k = 0.82;
        s.blob(cx, cy, cz, rx * k, ry * k, rz * k, mixHex(bl.color, shade, 0.4), i === 0 ? 1 : 0, crnd, 0.06);
      });
      brushDabs(s, toward(blobs, [0, 0.7, 0], 0.45), {
        count: 190,
        size: 0.085,
        tintSpread: petals ? 0.45 : 0.55,
        skyLighten: 0.5,
        gaps: 0.06,
        // V2X: orchard trees thin through autumn like the forest (`params.thin`, default 1).
        thin: typeof opts?.params?.thin === 'number' ? opts.params.thin : 1,
        seed: seed * 3 + 6,
      });
    },
    () => void s.blob(0.01, 0.7, -0.005, 0.4, 0.32, 0.4, leaf, 1, undefined, 0, dabTint(leaf, 0.6, 0.35)),
  );
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.6;
    const y = 0.58 + rnd() * 0.3;
    // On the dabs, a little proud of the crown's blobs.
    const r = (0.34 - Math.abs(y - 0.7) * 0.6) * 1.12;
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
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 4);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // Bellied barrels: two stacked frustums with darker iron hoops and a lid.
    // V2C: wood grain with wrought iron hoops; the far level is one 6-sided drum per barrel.
    for (const [x, z, r, h] of [
      [-0.06, 0, 0.07, 0.18],
      [0.09, 0.04, 0.07, 0.18],
      [0.01, -0.1, 0.06, 0.15],
    ] as const) {
      const wood = vary(palette.wood, rnd);
      s.surface(SURFACE.woodGrain);
      s.levels(
        () => {
          s.cylinder(x, z, r * 0.88, r, 0, h / 2, wood, 8);
          s.cylinder(x, z, r, r * 0.88, h / 2, h, wood, 8);
          s.surface(SURFACE.wroughtIron);
          s.cylinder(x, z, r * 0.93, r * 0.95, h * 0.18, h * 0.24, palette.metal, 8);
          s.cylinder(x, z, r * 0.95, r * 0.93, h * 0.76, h * 0.82, palette.metal, 8);
          s.surface(SURFACE.woodGrain);
        },
        () => farCylinder(s, x, z, r * 0.92, r * 0.92, 0, h, wood, 6),
      );
    }
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const bench: Kit = {
  id: 'bench',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 2);
    const wood = vary(palette.wood, rnd, 0.6);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // Side frames: leg panel, back post and arm rest. The back faces +z.
    // V2C: all wood grain; the far level is the two side frames, the seat and the back as boxes.
    s.surface(SURFACE.woodGrain);
    const seat2 = vary(wood, rnd, 0.5);
    const back1 = vary(wood, rnd, 0.5);
    s.levels(
      () => {
        for (const x of [-0.165, 0.135]) {
          s.rbox(x, 0, -0.05, x + 0.03, 0.1, 0.065, palette.timber, 0.008);
          s.box(x, 0.1, 0.045, x + 0.03, 0.25, 0.065, palette.timber);
          s.rbox(x - 0.005, 0.16, -0.055, x + 0.035, 0.18, 0.065, palette.timber, 0.008);
        }
        s.rbox(-0.18, 0.1, -0.055, 0.18, 0.12, -0.005, wood, 0.008);
        s.rbox(-0.18, 0.1, 0.0, 0.18, 0.12, 0.045, seat2, 0.008);
        s.rbox(-0.17, 0.14, 0.045, 0.17, 0.18, 0.065, back1, 0.008);
        s.rbox(-0.17, 0.2, 0.045, 0.17, 0.24, 0.065, wood, 0.008);
      },
      () => {
        for (const x of [-0.165, 0.135]) farBox(s, x, 0, -0.055, x + 0.03, 0.25, 0.065, palette.timber);
        farBox(s, -0.18, 0.1, -0.055, 0.18, 0.12, 0.045, wood);
        farBox(s, -0.17, 0.14, 0.045, 0.17, 0.24, 0.065, wood);
      },
    );
    s.surface(SURFACE.plain);
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
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 6);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // Slatted crates with corner battens; the top one holds a few apples.
    // V2C: wood grain with iron-dark bands; the far level is a plain box per crate.
    const crate = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
      const wood = vary(palette.wood, rnd);
      s.surface(SURFACE.woodGrain);
      s.levels(
        () => {
          s.rbox(x0, y0, z0, x1, y1, z1, wood, 0.01);
          const b = 0.012;
          s.surface(SURFACE.wroughtIron);
          s.box(
            x0 - 0.004,
            y0 + (y1 - y0) * 0.45,
            z0 - b,
            x1 + 0.004,
            y0 + (y1 - y0) * 0.55,
            z1 + b,
            palette.darkWood,
          );
          for (const [x, z] of [
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
          ] as const) {
            s.box(x - b, y0, z - b, x + b, y1, z + b, palette.darkWood);
          }
        },
        () => farBox(s, x0, y0, z0, x1, y1, z1, wood),
      );
    };
    crate(-0.13, 0, -0.08, 0.03, 0.15, 0.08);
    crate(0.04, 0, -0.06, 0.15, 0.12, 0.07);
    crate(-0.1, 0.15, -0.06, 0.02, 0.25, 0.06);
    s.surface(SURFACE.plain);
    for (const [x, z] of [
      [-0.07, -0.02],
      [-0.03, 0.02],
      [-0.05, 0.03],
    ] as const) {
      s.blob(x, 0.26, z, 0.022, 0.02, 0.022, palette.apple, 0);
    }
    return s.build();
  },
};

export const fence: Kit = {
  id: 'fence',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 14);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // A picket fence: two rails, chunky posts with pointed caps and pickets between them.
    // V2C: painted pickets on wood grain rails and posts; the far level is posts, one rail band and
    // one picket band.
    const wood = vary(palette.plasterCream, rnd, 0.5);
    const rail1 = vary(palette.wood, rnd);
    const rail2 = vary(palette.wood, rnd);
    s.surface(SURFACE.woodGrain);
    s.levels(
      () => {
        s.box(-0.5, 0.08, -0.012, 0.5, 0.11, 0.012, rail1);
        s.box(-0.5, 0.19, -0.012, 0.5, 0.22, 0.012, rail2);
        for (const x of [-0.47, 0, 0.47]) {
          s.rbox(x - 0.03, 0, -0.03, x + 0.03, 0.27, 0.03, palette.timber, 0.008);
          s.cylinder(x, 0, 0.035, 0, 0.27, 0.31, palette.timber, 4, Math.PI / 4);
        }
      },
      () => {
        for (const x of [-0.47, 0.47]) farBox(s, x - 0.03, 0, -0.03, x + 0.03, 0.29, 0.03, palette.timber);
        // The rails read as one dark band between the end posts.
        farBox(s, -0.44, 0.08, -0.015, 0.44, 0.22, 0.015, rail1, 'bk');
      },
    );
    s.surface(SURFACE.paintedWood);
    s.levels(
      () => {
        for (let i = 0; i < 8; i++) {
          const x = -0.385 + i * 0.11;
          if (Math.abs(x) < 0.05) continue;
          const h = 0.24 + (rnd() - 0.5) * 0.015;
          s.box(x - 0.017, 0.02, 0.012, x + 0.017, h, 0.024, wood);
          s.tri([x - 0.017, h, 0.024], [x + 0.017, h, 0.024], [x, h + 0.03, 0.024], wood, [0, 0, 1]);
          s.tri([x - 0.017, h, 0.012], [x + 0.017, h, 0.012], [x, h + 0.03, 0.012], wood, [0, 0, -1]);
        }
      },
      () => farBox(s, -0.4, 0.02, 0.012, 0.4, 0.27, 0.024, wood, 'bkrl'),
    );
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const flowerBed: Kit = {
  id: 'flower-bed',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 3);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // A stone edging around a mounded bed of soil with mixed blooms on leafy clumps.
    // V2C: stone edging, dirt soil, leafy clumps and blooms; the far level is the edging and two
    // lumps (green, then a blossom-tinted cap).
    s.surface(SURFACE.stone);
    s.rbox(-0.23, 0, -0.17, 0.23, 0.045, 0.17, vary(palette.stone, rnd), 0.02);
    s.surface(SURFACE.dirt);
    s.levels(
      () => s.blob(0, 0.045, 0, 0.2, 0.04, 0.14, palette.soil, 1),
      () => {
        s.surface(SURFACE.leaf);
        s.blob(0, 0.045, 0, 0.2, 0.1, 0.14, palette.leaf, 0);
        s.surface(SURFACE.flowers);
        s.blob(0, 0.08, 0, 0.15, 0.065, 0.1, mixHex(palette.leaf, palette.flowerB, 0.45), 0);
      },
    );
    const blooms = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD, palette.blossom];
    for (let i = 0; i < 12; i++) {
      const x = -0.15 + (i % 4) * 0.1 + (rnd() - 0.5) * 0.04;
      const z = -0.09 + Math.floor(i / 4) * 0.09 + (rnd() - 0.5) * 0.03;
      const y = 0.06 + 0.03 * (1 - Math.abs(x) / 0.2);
      s.surface(SURFACE.leaf);
      s.blob(x, y, z, 0.04, 0.03, 0.04, vary(palette.leaf, rnd), 0);
      const c = blooms[Math.floor(rnd() * blooms.length)]!;
      s.surface(SURFACE.flowers);
      s.blob(x + (rnd() - 0.5) * 0.02, y + 0.035, z, 0.028, 0.022, 0.028, c, 0);
    }
    s.surface(SURFACE.plain);
    return s.build();
  },
};
export const hedge: Kit = {
  id: 'hedge',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 10);
    const leaf = vary(palette.oakLeaf, rnd, 0.6);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // A clipped hedge with softly chamfered edges and a row of lumps along the top. V2B: near, a
    // deeper box under a clipped shell of dabs, shading from below its spine so the top catches
    // the sky; far, as before.
    const tops = [0, 1, 2, 3].map(() => vary(leaf, rnd, 1.2));
    s.levels(
      () => {
        s.rbox(-0.49, 0, -0.1, 0.49, 0.25, 0.1, mixHex(leaf, CORE_SHADE, 0.35), 0.05);
        const blobs: DabBlob[] = tops.map((c, i) => ({
          center: [-0.375 + i * 0.25, 0.15, 0],
          radii: [0.17, 0.14, 0.13],
          normalFrom: [-0.375 + i * 0.25, -0.1, 0],
          color: c,
        }));
        brushDabs(s, blobs, {
          count: 110,
          size: 0.075,
          tintSpread: 0.5,
          skyLighten: 0.55,
          gaps: 0,
          thin: 1,
          seed: (opts?.seed ?? 10) * 3 + 7,
        });
      },
      () => {
        s.rbox(-0.5, 0, -0.11, 0.5, 0.26, 0.11, leaf, 0.05);
        tops.forEach((c, i) => s.blob(-0.375 + i * 0.25, 0.25, 0, 0.15, 0.06, 0.1, c, 1));
      },
    );
    return s.build();
  },
};

export const lantern: Kit = {
  id: 'lantern',
  kind: 'decor',
  build: (opts) => {
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // V2C: wrought iron post, cap and roof on a stone foot. The far level keeps the pole, the flame
    // (same height, same glow) and the roof.
    s.surface(SURFACE.stone);
    s.levels(
      () => s.cylinder(0, 0, 0.06, 0.05, 0, 0.05, palette.stone, 8),
      () => undefined,
    );
    s.surface(SURFACE.wroughtIron);
    s.levels(
      () => {
        s.cylinder(0, 0, 0.025, 0.02, 0.05, 0.5, palette.metal, 6);
        s.box(-0.055, 0.49, -0.055, 0.055, 0.51, 0.055, palette.metal);
      },
      () => farCylinder(s, 0, 0, 0.032, 0.025, 0, 0.5, palette.metal, 4, Math.PI / 4, false),
    );
    s.surface(SURFACE.plain);
    s.glow(2);
    s.levels(
      () => s.box(-0.042, 0.51, -0.042, 0.042, 0.6, 0.042, palette.lantern),
      () => farBox(s, -0.042, 0.51, -0.042, 0.042, 0.6, 0.042, palette.lantern, 'bt'),
    );
    s.glow(0);
    s.surface(SURFACE.wroughtIron);
    s.levels(
      () => s.cylinder(0, 0, 0.075, 0, 0.6, 0.67, palette.metal, 4, Math.PI / 4),
      () => farCylinder(s, 0, 0, 0.075, 0, 0.6, 0.67, palette.metal, 4, Math.PI / 4),
    );
    s.surface(SURFACE.plain);
    s.blob(0, 0.68, 0, 0.012, 0.012, 0.012, palette.mustard, 0);
    return s.build();
  },
  anchors: () => ({ lights: [[0, 0.555, 0]] }),
};

export const lowWall: Kit = {
  id: 'low-wall',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 12);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // Two courses of chunky, slightly varied stones under a chamfered coping.
    // V2C: stone throughout; the far level is the wall body and the coping as two boxes.
    s.surface(SURFACE.stone);
    s.levels(
      () => {
        for (const [row, y0, y1] of [
          [0, 0, 0.08],
          [1, 0.08, 0.15],
        ] as const) {
          let x = -0.5;
          let k = row === 0 ? 0 : 0.12;
          while (x < 0.5 - 0.001) {
            const len = Math.min(0.5 - x, (row === 0 && x === -0.5 ? 0.22 : 0.24) + k);
            k = 0;
            s.rbox(x + 0.004, y0, -0.08, x + len - 0.004, y1, 0.08, vary(palette.stone, rnd, 1.5), 0.015);
            x += len;
          }
        }
      },
      () => s.box(-0.5, 0, -0.08, 0.5, 0.15, 0.08, palette.stone),
    );
    s.rbox(-0.5, 0.15, -0.09, 0.5, 0.19, 0.09, vary(palette.foundation, rnd, 0.6), 0.015);
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const planter: Kit = {
  id: 'planter',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 8);
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    // A terracotta pot with a rim, a leafy mound and a few blooms.
    // V2C: terracotta pot; the far level is a drum and a round mound.
    const pot = vary(palette.roofTerracotta, rnd, 0.6);
    const rim = vary(palette.brick, rnd, 0.5);
    const mound = vary(palette.birchLeaf, rnd);
    s.surface(SURFACE.terracotta);
    s.levels(
      () => {
        s.cylinder(0, 0, 0.08, 0.1, 0, 0.12, pot, 8, Math.PI / 8);
        s.cylinder(0, 0, 0.11, 0.11, 0.11, 0.14, rim, 8, Math.PI / 8);
      },
      () => farCylinder(s, 0, 0, 0.09, 0.11, 0, 0.14, pot, 6, Math.PI / 8, false),
    );
    s.surface(SURFACE.leaf);
    s.levels(
      () => s.blob(0, 0.16, 0, 0.1, 0.07, 0.1, mound, 1, rnd, 0.1),
      () => s.blob(0, 0.16, 0, 0.1, 0.07, 0.1, mound, 0),
    );
    const blooms = [palette.flowerA, palette.flowerB, palette.flowerD];
    s.surface(SURFACE.flowers);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rnd();
      s.blob(
        Math.cos(a) * 0.06,
        0.2 + rnd() * 0.02,
        Math.sin(a) * 0.06,
        0.025,
        0.02,
        0.025,
        blooms[i % 3]!,
        0,
      );
    }
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const signpost: Kit = {
  id: 'signpost',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 9);
    const s = new ShapeBuilder();
    // A post with a cap and two arrow boards pointing different ways, with a tuft at the foot.
    s.rbox(-0.025, 0, -0.025, 0.025, 0.47, 0.025, palette.timber, 0.008);
    s.cylinder(0, 0, 0.035, 0, 0.47, 0.52, palette.darkWood, 4, Math.PI / 4);
    const board = (y: number, dir: number, hex: number): void => {
      const x0 = dir > 0 ? 0.0 : -0.2;
      const x1 = dir > 0 ? 0.2 : 0.0;
      s.rbox(x0, y - 0.035, 0.025, x1, y + 0.035, 0.045, hex, 0.008);
      const tip = dir > 0 ? x1 : x0;
      s.tri([tip, y - 0.035, 0.045], [tip, y + 0.035, 0.045], [tip + dir * 0.04, y, 0.045], hex, [0, 0, 1]);
      s.tri([tip, y - 0.035, 0.025], [tip, y + 0.035, 0.025], [tip + dir * 0.04, y, 0.025], hex, [0, 0, -1]);
    };
    board(0.38, 1, vary(palette.wood, rnd));
    board(0.29, -1, vary(palette.plasterCream, rnd, 0.5));
    s.blob(0, 0.03, 0, 0.06, 0.03, 0.06, palette.leaf, 0);
    return s.build();
  },
};
