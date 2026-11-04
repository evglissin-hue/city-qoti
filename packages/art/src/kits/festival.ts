// C5E: festival pieces (docs/spec/12-hearth.md, Festivals): a bonfire in a ring of stones, bunting
// on poles, a stage with a striped canopy, a stall with a striped awning, a long table with benches,
// and a flower arch; plus the circus tent and its wagons, and the festival's festoon lanterns, which
// the renderer places itself. Decor is centered on the origin (linear pieces run along +x across
// one tile). Every face carries its surface id; the far level keeps the outline and the colors.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import { FLOWERS } from './style';
import type { Kit, KitBuildOptions } from './types';

/** Bunting and canopy colors: soft, sunny, never neon. */
export const FESTIVAL_COLORS: readonly number[] = [
  0xe9707a, 0xf3d35b, 0x8fb8d9, 0x9cc38a, 0xf4ecdd, 0xd99a5e,
];

const builder = (opts?: KitBuildOptions): ShapeBuilder => new ShapeBuilder(opts?.lod ?? 'high');

/** A sagging string of little triangular flags from a to b. */
export function buntingRun(s: ShapeBuilder, a: V3, b: V3, n: number, rnd: () => number, sag = 0.08): void {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const dip = 4 * t * (1 - t) * sag;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - dip, a[2] + (b[2] - a[2]) * t]);
  }
  s.surface(SURFACE.plain);
  for (let i = 0; i < n; i++) beam(s, pts[i]!, pts[i + 1]!, 0.004, 0xf4ecdd);
  s.surface(SURFACE.flags);
  const off = Math.floor(rnd() * FESTIVAL_COLORS.length);
  s.nearOnly(() => {
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.075, (p[2] + q[2]) / 2];
      const hex = FESTIVAL_COLORS[(i + off) % FESTIVAL_COLORS.length]!;
      // Two faces back to back, so a flag reads from both sides.
      const dx = q[0] - p[0];
      const dz = q[2] - p[2];
      const n0: V3 = [-dz, 0, dx];
      const n1: V3 = [dz, 0, -dx];
      const pa: V3 = [p[0] + dx * 0.12, p[1], p[2] + dz * 0.12];
      const qa: V3 = [q[0] - dx * 0.12, q[1], q[2] - dz * 0.12];
      s.tri(pa, qa, m, hex, n0);
      s.tri(pa, qa, m, hex, n1);
    }
  });
  s.surface(SURFACE.plain);
}

// --- Bonfire ------------------------------------------------------------------------------------

/** C5E: where the bonfire's flames sit (the festival effects draw them, lit). */
export const BONFIRE_FLAME: V3 = [0, 0.04, 0];

export const bonfire: Kit = {
  id: 'bonfire',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 73);
    const s = builder(opts);
    // A ring of stones, a bed of embers and a teepee of logs; the flames are the effects' job.
    s.surface(SURFACE.stone);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2;
      const r = 0.27;
      s.blob(
        Math.cos(a) * r,
        0.055,
        Math.sin(a) * r,
        0.055,
        0.045,
        0.05,
        vary(palette.stone, rnd, 1.2),
        0,
        rnd,
        0.2,
      );
    }
    s.surface(SURFACE.dirt);
    s.cylinder(0, 0, 0.24, 0.22, 0, 0.015, 0x4a3a2e, 10);
    s.surface(SURFACE.plain);
    s.glow(2);
    s.blob(0, 0.03, 0, 0.14, 0.03, 0.14, 0xff9a4a, 0);
    s.glow(0);
    s.surface(SURFACE.timber);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd() * 0.3;
      beam(
        s,
        [Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17],
        [Math.cos(a) * 0.02, 0.36, Math.sin(a) * 0.02],
        0.026,
        vary(0x6b4a30, rnd, 0.6),
      );
    }
    // A stack of spare logs, and a bench log to sit on.
    s.nearOnly(() => {
      for (let i = 0; i < 3; i++)
        beam(
          s,
          [0.34, 0.035 + (i === 2 ? 0.045 : 0), -0.12 + i * 0.05 - (i === 2 ? 0.025 : 0)],
          [0.48, 0.035 + (i === 2 ? 0.045 : 0), -0.12 + i * 0.05 - (i === 2 ? 0.025 : 0)],
          0.024,
          vary(palette.wood, rnd, 0.5),
        );
    });
    s.surface(SURFACE.plain);
    return s.build();
  },
  anchors: () => ({ lights: [[0, 0.15, 0]] }),
};

// --- Bunting ------------------------------------------------------------------------------------

export const bunting: Kit = {
  id: 'bunting',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 79);
    const s = builder(opts);
    // Poles at both ends (a run shares them, overlapping), ribboned tops, flags between.
    s.surface(SURFACE.timber);
    for (const x of [-0.47, 0.47]) {
      s.cylinder(x, 0, 0.02, 0.016, 0, 0.82, palette.timber, 6);
      s.surface(SURFACE.plain);
      s.blob(x, 0.84, 0, 0.022, 0.022, 0.022, palette.mustard, 0);
      s.surface(SURFACE.timber);
    }
    buntingRun(s, [-0.47, 0.78, 0], [0.47, 0.78, 0], 7, rnd, 0.1);
    s.levels(
      () => {},
      () => {
        // Far off the flags read as a soft band of color.
        s.surface(SURFACE.flags);
        s.box(-0.45, 0.62, -0.004, 0.45, 0.72, 0.004, FESTIVAL_COLORS[0]!);
      },
    );
    s.surface(SURFACE.plain);
    return s.build();
  },
};

// --- Stage --------------------------------------------------------------------------------------

export const festivalStage: Kit = {
  id: 'festival-stage',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 83);
    const s = builder(opts);
    const W = 0.5;
    const D = 0.36;
    const deck = 0.16;
    // A planked platform on trestles, two steps at the front (+z), a back wall with a painted sun,
    // and a striped canopy on four posts.
    s.surface(SURFACE.timber);
    s.rbox(-W, 0, -D, W, deck, D, vary(palette.wood, rnd, 0.5), 0.01);
    s.nearOnly(() => {
      for (let i = 0; i < 7; i++) {
        const x = -W + 0.02 + i * ((2 * W - 0.04) / 7);
        s.box(x, deck, -D + 0.01, x + 0.004, deck + 0.002, D - 0.01, palette.darkWood);
      }
    });
    for (let i = 0; i < 2; i++)
      s.box(
        -0.14,
        0,
        D + i * 0.06,
        0.14,
        deck - (i + 1) * 0.055,
        D + 0.06 + i * 0.06,
        vary(palette.wood, rnd, 0.4),
      );
    s.box(-W, deck, -D, W, deck + 0.42, -D + 0.035, vary(0x5b6f8a, rnd, 0.3));
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      s.blob(0, deck + 0.24, -D + 0.04, 0.09, 0.09, 0.008, palette.mustard, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        beam(
          s,
          [Math.cos(a) * 0.1, deck + 0.24 + Math.sin(a) * 0.1, -D + 0.042],
          [Math.cos(a) * 0.15, deck + 0.24 + Math.sin(a) * 0.15, -D + 0.042],
          0.008,
          palette.mustard,
        );
      }
    });
    s.surface(SURFACE.timber);
    const top = deck + 0.55;
    for (const [x, z] of [
      [-W + 0.03, -D + 0.03],
      [W - 0.03, -D + 0.03],
      [-W + 0.03, D - 0.03],
      [W - 0.03, D - 0.03],
    ] as const)
      s.cylinder(x, z, 0.018, 0.018, deck, top, palette.timber, 6);
    s.surface(SURFACE.awning);
    s.gable(-W - 0.06, -D - 0.04, W + 0.06, D + 0.08, top, top + 0.16, vary(0xe9707a, rnd, 0.3), true);
    // A scalloped valance along the front.
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      for (let i = 0; i < 8; i++) {
        const x = -W + 0.02 + i * ((2 * W) / 8);
        s.tri(
          [x, top, D + 0.08],
          [x + (2 * W) / 8 - 0.01, top, D + 0.08],
          [x + W / 8, top - 0.05, D + 0.08],
          i % 2 ? 0xf4ecdd : 0xe9707a,
          [0, 0, 1],
        );
      }
    });
    // Lanterns at the front corners, lit every night.
    s.glow(2);
    for (const x of [-W + 0.03, W - 0.03])
      s.blob(x, top - 0.05, D + 0.0, 0.025, 0.03, 0.025, palette.lantern, 0);
    s.glow(0);
    return s.build();
  },
  anchors: () => ({
    lights: [
      [-0.47, 0.66, 0.36],
      [0.47, 0.66, 0.36],
    ],
  }),
};

// --- Stall --------------------------------------------------------------------------------------

/** C5E: the top of a festival stall's counter, where the festival layer sets out the menu. */
export const STALL_COUNTER: { y: number; x0: number; x1: number; z: number } = {
  y: 0.24,
  x0: -0.26,
  x1: 0.26,
  z: 0.08,
};

export const festivalStall: Kit = {
  id: 'festival-stall',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 89);
    const s = builder(opts);
    const stripe = FESTIVAL_COLORS[Math.floor(rnd() * 4)]!;
    // A counter of planks on a frame, a striped awning on four posts, a pennant-hung board, and a
    // couple of barrels behind (the menu's goods are set on the counter by the festival layer).
    s.surface(SURFACE.timber);
    s.box(-0.3, 0, 0.02, 0.3, STALL_COUNTER.y - 0.02, 0.14, vary(palette.wood, rnd, 0.6));
    s.box(-0.32, STALL_COUNTER.y - 0.02, 0.0, 0.32, STALL_COUNTER.y, 0.16, vary(palette.darkWood, rnd, 0.4));
    for (const [x, z] of [
      [-0.3, 0.14],
      [0.3, 0.14],
      [-0.3, -0.2],
      [0.3, -0.2],
    ] as const)
      s.box(x - 0.015, 0, z - 0.015, x + 0.015, 0.62, z + 0.015, palette.timber);
    s.surface(SURFACE.awning);
    s.quad(
      [-0.36, 0.62, -0.24],
      [0.36, 0.62, -0.24],
      [0.36, 0.54, 0.26],
      [-0.36, 0.54, 0.26],
      vary(stripe, rnd, 0.3),
      [0, 1, 0.15],
    );
    s.quad(
      [-0.36, 0.62, -0.24],
      [0.36, 0.62, -0.24],
      [0.36, 0.54, 0.26],
      [-0.36, 0.54, 0.26],
      vary(stripe, rnd, 0.3),
      [0, -1, -0.15],
    );
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      for (let i = 0; i < 6; i++) {
        const x = -0.36 + i * 0.12;
        s.tri(
          [x, 0.54, 0.26],
          [x + 0.12, 0.54, 0.26],
          [x + 0.06, 0.49, 0.26],
          i % 2 ? 0xf4ecdd : stripe,
          [0, 0, 1],
        );
      }
      // A chalked price board and two barrels at the back.
      s.box(-0.12, 0.62, 0.1, 0.12, 0.72, 0.115, palette.ink);
      s.box(-0.1, 0.64, 0.116, 0.1, 0.7, 0.118, 0xd8d0c0);
      for (const x of [-0.18, 0.18]) {
        s.cylinder(x, -0.12, 0.06, 0.065, 0, 0.16, vary(palette.wood, rnd, 0.5), 8);
        s.cylinder(x, -0.12, 0.066, 0.066, 0.12, 0.135, palette.metal, 8);
      }
    });
    return s.build();
  },
};

// --- Table --------------------------------------------------------------------------------------

export const festivalTable: Kit = {
  id: 'festival-table',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 97);
    const s = builder(opts);
    const wood = vary(palette.wood, rnd, 0.5);
    // A long trestle table under a checked cloth, benches both sides, jugs, a pie and a posy.
    s.surface(SURFACE.timber);
    s.box(-0.32, 0.18, -0.08, 0.32, 0.2, 0.08, wood);
    for (const x of [-0.27, 0.25]) s.box(x, 0, -0.06, x + 0.02, 0.18, 0.06, palette.timber);
    for (const z of [-0.17, 0.17]) {
      s.box(-0.32, 0.1, z - 0.035, 0.32, 0.12, z + 0.035, vary(wood, rnd, 0.4));
      for (const x of [-0.27, 0.25]) s.box(x, 0, z - 0.025, x + 0.02, 0.1, z + 0.025, palette.timber);
    }
    s.surface(SURFACE.awning);
    s.box(-0.3, 0.2, -0.085, 0.3, 0.205, 0.085, vary(0xe9a0a8, rnd, 0.2));
    s.surface(SURFACE.plain);
    s.nearOnly(() => {
      for (let i = 0; i < 3; i++) {
        const x = -0.2 + i * 0.2 + (rnd() - 0.5) * 0.04;
        s.cylinder(x, (rnd() - 0.5) * 0.06, 0.02, 0.022, 0.205, 0.26, vary(0xc9b48a, rnd, 0.4), 6);
      }
      s.cylinder(0.1, 0.02, 0.045, 0.05, 0.205, 0.225, 0xd9a35a, 8);
      s.cylinder(0.1, 0.02, 0.04, 0.0, 0.225, 0.235, 0xc98a45, 8);
      s.cylinder(-0.08, -0.02, 0.015, 0.02, 0.205, 0.25, 0x9fb7c9, 6);
      s.surface(SURFACE.flowers);
      for (let i = 0; i < 3; i++)
        s.blob(-0.08 + (i - 1) * 0.015, 0.27, -0.02, 0.018, 0.016, 0.018, FLOWERS[i]!, 0);
      s.surface(SURFACE.plain);
    });
    return s.build();
  },
};

// --- Flower arch --------------------------------------------------------------------------------

export const flowerArch: Kit = {
  id: 'flower-arch',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 101);
    const s = builder(opts);
    // Two posts and a hoop of willow wound with leaves and flowers, over a path (along x).
    s.surface(SURFACE.timber);
    for (const x of [-0.42, 0.42]) s.cylinder(x, 0, 0.025, 0.022, 0, 0.55, vary(palette.wood, rnd, 0.4), 6);
    const n = 9;
    const at = (t: number): V3 => {
      const a = Math.PI * t;
      return [-Math.cos(a) * 0.42, 0.55 + Math.sin(a) * 0.3, 0];
    };
    for (let i = 0; i < n; i++) beam(s, at(i / n), at((i + 1) / n), 0.02, vary(0x8a7a50, rnd, 0.4));
    s.surface(SURFACE.leaf);
    s.levels(
      () => {
        for (let i = 0; i <= 9; i++) {
          const p = at(i / 9);
          s.blob(p[0], p[1], p[2], 0.06, 0.05, 0.06, vary(palette.leaf, rnd, 0.8), 0, rnd, 0.2);
        }
        for (const x of [-0.42, 0.42])
          for (let i = 0; i < 3; i++)
            s.blob(x, 0.12 + i * 0.15, 0.0, 0.05, 0.05, 0.05, vary(palette.leaf, rnd, 0.8), 0);
        s.surface(SURFACE.flowers);
        for (let i = 0; i <= 12; i++) {
          const p = at(rnd());
          s.blob(
            p[0] + (rnd() - 0.5) * 0.06,
            p[1] + (rnd() - 0.5) * 0.05,
            (rnd() - 0.5) * 0.08,
            0.025,
            0.022,
            0.025,
            FLOWERS[Math.floor(rnd() * FLOWERS.length)]!,
            0,
          );
        }
      },
      () => {
        for (let i = 0; i < 4; i++) beam(s, at(i / 4), at((i + 1) / 4), 0.06, palette.leaf);
        for (const x of [-0.42, 0.42]) s.box(x - 0.05, 0, -0.05, x + 0.05, 0.55, 0.05, palette.leaf);
      },
    );
    s.surface(SURFACE.plain);
    return s.build();
  },
};

// --- The circus (drawn by the festival layer on the Village Green) --------------------------------

/** C5E: the circus tent, its pennants and two painted wagons, about four tiles across, centered. */
export function circusGeometry(lod: 'high' | 'low' = 'high'): ShapeBuilder {
  const rnd = seeded(103);
  const s = new ShapeBuilder(lod);
  const R = 1.5;
  const wallH = 0.7;
  const seg = lod === 'low' ? 8 : 16;
  const red = 0xd0655c;
  const cream = 0xf4ecdd;
  // Striped walls and a striped cone, a scalloped skirt, the king pole and a pennant on top (the
  // canvas is plain: the panels are the stripes).
  s.surface(SURFACE.plain);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const hex = i % 2 ? cream : red;
    const p0: V3 = [Math.cos(a0) * R, 0, Math.sin(a0) * R];
    const p1: V3 = [Math.cos(a1) * R, 0, Math.sin(a1) * R];
    const out: V3 = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
    // The doorway (+z) is a dark opening with the flaps tied back.
    const door = Math.abs((a0 + a1) / 2 - Math.PI / 2) < Math.PI / seg + 0.01;
    s.quad(
      [p0[0], 0, p0[2]],
      [p1[0], 0, p1[2]],
      [p1[0], wallH, p1[2]],
      [p0[0], wallH, p0[2]],
      door ? 0x3b3229 : hex,
      out,
    );
    const t0: V3 = [p0[0], wallH, p0[2]];
    const t1: V3 = [p1[0], wallH, p1[2]];
    const top: V3 = [0, wallH + 1.0, 0];
    s.tri(t0, t1, top, hex, [out[0], 0.8, out[2]]);
    // The skirt's scallop under each panel's edge.
    if (lod === 'high') {
      const m: V3 = [((p0[0] + p1[0]) / 2) * 1.04, wallH - 0.1, ((p0[2] + p1[2]) / 2) * 1.04];
      s.tri(
        [p0[0] * 1.04, wallH, p0[2] * 1.04],
        [p1[0] * 1.04, wallH, p1[2] * 1.04],
        m,
        i % 2 ? red : cream,
        out,
      );
    }
  }
  s.surface(SURFACE.timber);
  s.cylinder(0, 0, 0.03, 0.025, wallH + 0.95, wallH + 1.35, palette.timber, 6);
  s.surface(SURFACE.flags);
  s.tri([0, wallH + 1.33, 0], [0, wallH + 1.2, 0], [0.32, wallH + 1.27, 0], palette.mustard, [0, 0, 1]);
  s.tri([0, wallH + 1.33, 0], [0, wallH + 1.2, 0], [0.32, wallH + 1.27, 0], palette.mustard, [0, 0, -1]);
  // Bunting from the top to four guy pegs.
  s.nearOnly(() => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      buntingRun(
        s,
        [0, wallH + 0.98, 0],
        [Math.cos(a) * (R + 0.6), 0.1, Math.sin(a) * (R + 0.6)],
        8,
        rnd,
        0.05,
      );
      s.surface(SURFACE.timber);
      s.cylinder(Math.cos(a) * (R + 0.6), Math.sin(a) * (R + 0.6), 0.02, 0.015, 0, 0.12, palette.darkWood, 5);
    }
  });
  // Two painted wagons with high wheels, parked to one side.
  for (const [cx, cz, hex] of [
    [-R - 0.9, -0.5, 0x4e6f86],
    [R + 0.9, -0.6, 0x5f7a52],
  ] as const) {
    s.surface(SURFACE.timber);
    s.rbox(cx - 0.32, 0.18, cz - 0.18, cx + 0.32, 0.62, cz + 0.18, vary(hex, rnd, 0.3), 0.02);
    s.surface(SURFACE.zinc);
    s.gable(cx - 0.36, cz - 0.21, cx + 0.36, cz + 0.21, 0.62, 0.74, vary(cream, rnd, 0.2), true);
    s.surface(SURFACE.plain);
    s.glow(1);
    s.box(cx - 0.08, 0.36, cz + 0.181, cx + 0.08, 0.48, cz + 0.19, palette.window);
    s.glow(0);
    s.surface(SURFACE.timber);
    for (const dx of [-0.22, 0.22])
      for (const dz of [-0.2, 0.2]) {
        const z0 = cz + dz + (dz > 0 ? 0 : -0.03);
        s.levels(
          () => {
            for (let k = 0; k < 8; k++) {
              const a0 = (k / 8) * Math.PI * 2;
              const a1 = ((k + 1) / 8) * Math.PI * 2;
              s.quad(
                [cx + dx + Math.cos(a0) * 0.15, 0.15 + Math.sin(a0) * 0.15, z0],
                [cx + dx + Math.cos(a1) * 0.15, 0.15 + Math.sin(a1) * 0.15, z0],
                [cx + dx + Math.cos(a1) * 0.15, 0.15 + Math.sin(a1) * 0.15, z0 + 0.03],
                [cx + dx + Math.cos(a0) * 0.15, 0.15 + Math.sin(a0) * 0.15, z0 + 0.03],
                palette.mustard,
                [Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0],
              );
            }
          },
          () => void s.box(cx + dx - 0.12, 0.0, z0, cx + dx + 0.12, 0.28, z0 + 0.03, palette.mustard),
        );
      }
  }
  s.surface(SURFACE.plain);
  return s;
}

/** C5E: one festoon lantern string between two posts, for the festival site's edge; lit at night. */
export function festoonPosts(
  s: ShapeBuilder,
  a: [number, number],
  b: [number, number],
  rnd: () => number,
): V3[] {
  const lights: V3[] = [];
  const H = 0.9;
  s.surface(SURFACE.timber);
  for (const [x, z] of [a, b]) s.cylinder(x, z, 0.022, 0.018, 0, H + 0.04, palette.timber, 6);
  const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2.2));
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, H - 4 * t * (1 - t) * 0.16, a[1] + (b[1] - a[1]) * t]);
  }
  s.surface(SURFACE.plain);
  for (let i = 0; i < n; i++) beam(s, pts[i]!, pts[i + 1]!, 0.004, 0x3b3229);
  const colors = [0xffc977, 0xf2b8c6, 0xffd58a, 0xbfe0a0];
  for (let i = 1; i < n; i++) {
    const p = pts[i]!;
    s.glow(2);
    s.blob(p[0], p[1] - 0.03, p[2], 0.026, 0.032, 0.026, vary(colors[i % colors.length]!, rnd, 0.2), 0);
    s.glow(0);
    if (i % 2 === 1) lights.push([p[0], p[1] - 0.035, p[2]]);
  }
  return lights;
}
