// Playtest round seven: the six Village pieces drawn as themselves (they stood in as a birdbath, a
// lantern, a bench, a planter and signposts until now) and the five pricier pieces that help the
// workplace beside them (content/fineDecor.ts). House style as decor.ts: small chunky primitives,
// centered on the origin, a tile across at most.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import type { Kit } from './types';

const BLOOMS = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD, palette.blossom];

/** A solid cart wheel: an octagonal disc on each side of the axle with a darker hub plate. */
function wheel(s: ShapeBuilder, cx: number, cy: number, z: number, r: number, hex: number): void {
  const n = 8;
  for (const [side, rr, c] of [
    [1, r, hex],
    [1, r * 0.4, palette.metal],
  ] as const) {
    for (const out of [1, -1] as const) {
      const zz = z + out * (0.012 + (side === 1 && rr < r ? 0.004 : 0));
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const p0: V3 = [cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, zz];
        const p1: V3 = [cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, zz];
        if (out === 1) s.tri([cx, cy, zz], p0, p1, c, [0, 0, 1]);
        else s.tri([cx, cy, zz], p1, p0, c, [0, 0, -1]);
      }
    }
  }
}

export const cafeTable: Kit = {
  id: 'cafe-table',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 21);
    const s = new ShapeBuilder();
    // A round table under a cloth on one stout leg, with a posy, and two bentwood chairs.
    s.cylinder(0, 0, 0.1, 0.06, 0, 0.04, palette.metal, 8);
    s.cylinder(0, 0, 0.025, 0.025, 0.04, 0.3, palette.darkWood, 6);
    s.cylinder(0, 0, 0.18, 0.2, 0.25, 0.31, palette.plasterCream, 8);
    s.cylinder(0, 0, 0.17, 0.17, 0.31, 0.325, palette.wood, 8);
    s.cylinder(0, 0, 0.1, 0.1, 0.326, 0.33, palette.accentRed, 8);
    s.cylinder(0.03, 0.02, 0.025, 0.02, 0.33, 0.37, palette.white, 6);
    s.surface(SURFACE.flowers);
    s.blob(0.03, 0.385, 0.02, 0.025, 0.02, 0.025, palette.flowerB, 0);
    s.surface(SURFACE.plain);
    for (const a of [Math.PI * 0.15, Math.PI * 1.1]) {
      const cx = Math.cos(a) * 0.3;
      const cz = Math.sin(a) * 0.3;
      const wood = vary(palette.wood, rnd, 0.5);
      s.cylinder(cx, cz, 0.07, 0.07, 0.17, 0.2, wood, 8);
      for (const [dx, dz] of [
        [-0.045, -0.045],
        [0.045, 0.045],
      ] as const)
        beam(s, [cx + dx, 0, cz + dz], [cx + dx, 0.17, cz + dz], 0.012, wood);
      s.cylinder(cx + Math.cos(a) * 0.065, cz + Math.sin(a) * 0.065, 0.03, 0.03, 0.2, 0.36, wood, 6);
    }
    return s.build();
  },
};

export const flowerCart: Kit = {
  id: 'flower-cart',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 22);
    const s = new ShapeBuilder();
    // A painted handcart: two big wheels, a bed heaped with blooms, shafts out the back, a striped awning.
    s.rbox(-0.2, 0.17, -0.12, 0.2, 0.2, 0.12, palette.teal, 0.01);
    s.rbox(-0.2, 0.2, -0.12, 0.2, 0.3, -0.1, palette.teal, 0.01);
    s.rbox(-0.2, 0.2, 0.1, 0.2, 0.3, 0.12, palette.teal, 0.01);
    s.rbox(-0.2, 0.2, -0.12, -0.18, 0.3, 0.12, palette.teal, 0.01);
    s.rbox(0.18, 0.2, -0.12, 0.2, 0.3, 0.12, palette.teal, 0.01);
    s.nearOnly(() => {
      for (const z of [-0.14, 0.14]) wheel(s, 0, 0.14, z, 0.12, palette.darkWood);
      beam(s, [0.2, 0.2, -0.08], [0.46, 0.1, -0.06], 0.014, palette.wood);
      beam(s, [0.2, 0.2, 0.08], [0.46, 0.1, 0.06], 0.014, palette.wood);
      beam(s, [0.46, 0.1, -0.06], [0.46, 0.1, 0.06], 0.012, palette.wood);
    });
    beam(s, [-0.2, 0.17, 0], [0.2, 0.17, 0], 0.03, palette.darkWood);
    s.blob(0, 0.3, 0, 0.17, 0.05, 0.1, palette.leaf, 1, rnd, 0.06);
    for (let i = 0; i < 14; i++) {
      const x = -0.16 + (i % 7) * 0.053 + (rnd() - 0.5) * 0.02;
      const z = i < 7 ? -0.05 : 0.05;
      s.surface(SURFACE.flowers);
      s.blob(x, 0.34 + rnd() * 0.02, z + (rnd() - 0.5) * 0.03, 0.032, 0.026, 0.032, BLOOMS[i % 5]!, 0);
    }
    s.surface(SURFACE.plain);
    beam(s, [-0.17, 0.3, -0.1], [-0.17, 0.56, -0.1], 0.012, palette.wood);
    beam(s, [-0.17, 0.3, 0.1], [-0.17, 0.56, 0.1], 0.012, palette.wood);
    for (let i = 0; i < 4; i++) {
      const z0 = -0.14 + i * 0.07;
      s.quad(
        [-0.2, 0.58, z0],
        [0.1, 0.52, z0],
        [0.1, 0.52, z0 + 0.07],
        [-0.2, 0.58, z0 + 0.07],
        i % 2 === 0 ? palette.accentRed : palette.white,
        [0, 1, 0],
      );
    }
    return s.build();
  },
};

export const fountain: Kit = {
  id: 'fountain',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 23);
    const s = new ShapeBuilder();
    // A two-tier stone fountain: a wide basin of water, a pedestal, a smaller bowl and a spout.
    s.cylinder(0, 0, 0.36, 0.34, 0, 0.14, vary(palette.stone, rnd, 0.6), 10);
    s.cylinder(0, 0, 0.3, 0.3, 0.1, 0.145, palette.waterDeep, 10);
    s.cylinder(0, 0, 0.07, 0.05, 0.12, 0.34, palette.foundation, 8);
    s.cylinder(0, 0, 0.18, 0.07, 0.34, 0.4, vary(palette.stone, rnd, 0.6), 8);
    s.cylinder(0, 0, 0.17, 0.18, 0.4, 0.43, palette.stone, 8);
    s.cylinder(0, 0, 0.16, 0.16, 0.42, 0.435, palette.waterDeep, 8);
    s.cylinder(0, 0, 0.03, 0.025, 0.4, 0.6, palette.foundation, 8);
    s.blob(0, 0.63, 0, 0.05, 0.04, 0.05, palette.stone, 1);
    s.cylinder(0, 0, 0.012, 0.035, 0.5, 0.62, palette.foam, 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      beam(
        s,
        [Math.cos(a) * 0.17, 0.4, Math.sin(a) * 0.17],
        [Math.cos(a) * 0.2, 0.14, Math.sin(a) * 0.2],
        0.007,
        palette.foam,
      );
    }
    return s.build();
  },
};

export const lampPost: Kit = {
  id: 'lamp-post',
  kind: 'decor',
  build: () => {
    const s = new ShapeBuilder();
    // A cast-iron street lamp: base, tall pole, two scrolled arms each with a lit lantern.
    s.cylinder(0, 0, 0.07, 0.05, 0, 0.12, palette.metal, 8);
    s.cylinder(0, 0, 0.032, 0.02, 0.12, 0.8, palette.metal, 6);
    s.cylinder(0, 0, 0.04, 0.04, 0.5, 0.53, palette.metal, 6);
    s.cylinder(0, 0, 0.03, 0.03, 0.78, 0.82, palette.metal, 6);
    for (const dir of [-1, 1]) {
      beam(s, [0, 0.76, 0], [dir * 0.14, 0.82, 0], 0.012, palette.metal);
      beam(s, [dir * 0.14, 0.82, 0], [dir * 0.18, 0.78, 0], 0.01, palette.metal);
      const x = dir * 0.18;
      s.box(x - 0.04, 0.6, -0.04, x + 0.04, 0.62, 0.04, palette.metal);
      s.glow(2);
      s.box(x - 0.032, 0.62, -0.032, x + 0.032, 0.72, 0.032, palette.lantern);
      s.glow(0);
      s.cylinder(x, 0, 0.06, 0, 0.72, 0.8, palette.metal, 4, Math.PI / 4);
    }
    s.blob(0, 0.86, 0, 0.02, 0.02, 0.02, palette.mustard, 0);
    return s.build();
  },
  anchors: () => ({
    lights: [
      [-0.18, 0.67, 0],
      [0.18, 0.67, 0],
    ],
  }),
};

export const maypole: Kit = {
  id: 'maypole',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 24);
    const s = new ShapeBuilder();
    // A tall pale pole on a stone footing, a wreath at the crown, six ribbons to the ground.
    s.cylinder(0, 0, 0.14, 0.11, 0, 0.06, vary(palette.stone, rnd, 0.6), 8);
    s.cylinder(0, 0, 0.035, 0.022, 0.06, 1.1, palette.birchBark, 8);
    for (const [y, hex] of [
      [0.3, palette.accentRed],
      [0.55, palette.mustard],
    ] as const)
      s.cylinder(0, 0, 0.04, 0.04, y, y + 0.025, hex, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      s.blob(Math.cos(a) * 0.1, 1.08, Math.sin(a) * 0.1, 0.045, 0.035, 0.045, palette.leaf, 0);
      s.surface(SURFACE.flowers);
      s.blob(Math.cos(a) * 0.11, 1.1, Math.sin(a) * 0.11, 0.025, 0.022, 0.025, BLOOMS[i % 5]!, 0);
      s.surface(SURFACE.plain);
    }
    s.cylinder(0, 0, 0.02, 0, 1.1, 1.18, palette.mustard, 6);
    const ribbons = [palette.accentRed, palette.mustard, palette.teal, palette.flowerC, palette.blossom];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const hex = ribbons[i % ribbons.length]!;
      const sway = 0.02 + rnd() * 0.03;
      const top: V3 = [Math.cos(a) * 0.03, 1.05, Math.sin(a) * 0.03];
      const foot: V3 = [Math.cos(a + 0.3) * (0.2 + sway), 0.08, Math.sin(a + 0.3) * (0.2 + sway)];
      beam(s, top, foot, 0.01, hex);
    }
    return s.build();
  },
};

export const noticeBoard: Kit = {
  id: 'notice-board',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 25);
    const s = new ShapeBuilder();
    // Two posts holding a cork-and-plank board under a little tiled roof, pinned with notices.
    for (const x of [-0.2, 0.2]) s.rbox(x - 0.025, 0, -0.03, x + 0.025, 0.58, 0.03, palette.timber, 0.008);
    s.rbox(-0.22, 0.2, 0.0, 0.22, 0.52, 0.04, palette.wood, 0.01);
    s.rbox(-0.19, 0.23, 0.04, 0.19, 0.49, 0.048, 0xb88a56, 0.006);
    const paper = [palette.plasterCream, palette.white, palette.plasterButter, palette.plasterSky];
    for (let i = 0; i < 5; i++) {
      const x = -0.15 + (i % 3) * 0.11 + (rnd() - 0.5) * 0.02;
      const y = 0.27 + Math.floor(i / 3) * 0.12 + rnd() * 0.02;
      const w = 0.045 + rnd() * 0.02;
      s.box(x - w / 2, y, 0.048, x + w / 2, y + 0.07, 0.052, paper[i % paper.length]!);
      s.blob(x, y + 0.066, 0.054, 0.007, 0.007, 0.007, palette.accentRed, 0);
    }
    s.gable(-0.27, -0.07, 0.27, 0.1, 0.54, 0.68, vary(palette.roofTerracotta, rnd, 0.5), true);
    s.blob(0, 0.03, 0.07, 0.07, 0.03, 0.05, palette.leaf, 0);
    return s.build();
  },
};

export const flowerTrellis: Kit = {
  id: 'flower-trellis',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 26);
    const s = new ShapeBuilder();
    // A lattice of white laths on two posts, a climbing rose over it, a trough at the foot.
    const white = palette.white;
    for (const x of [-0.2, 0.2]) s.rbox(x - 0.02, 0, -0.02, x + 0.02, 0.62, 0.02, white, 0.006);
    s.rbox(-0.22, 0.6, -0.025, 0.22, 0.65, 0.025, white, 0.006);
    for (let i = 0; i < 3; i++) {
      const x = -0.15 + i * 0.13;
      beam(s, [x, 0.1, 0], [x + 0.1, 0.6, 0], 0.008, white);
      beam(s, [x + 0.1, 0.1, 0], [x, 0.6, 0], 0.008, white);
    }
    s.rbox(-0.25, 0, -0.06, 0.25, 0.1, 0.06, palette.wood, 0.01);
    s.blob(0, 0.1, 0, 0.22, 0.04, 0.045, palette.soil, 1);
    for (let i = 0; i < 10; i++) {
      const x = -0.2 + (i % 10) * 0.045 + (rnd() - 0.5) * 0.02;
      const edge = Math.abs(x) / 0.2;
      const y = (0.14 + rnd() * 0.46) * (0.6 + 0.4 * edge);
      s.blob(x, y, 0.01, 0.035, 0.03, 0.03, vary(palette.leaf, rnd, 0.8), 0);
      s.surface(SURFACE.flowers);
      s.blob(
        x + (rnd() - 0.5) * 0.02,
        y + 0.02,
        0.03,
        0.022,
        0.02,
        0.02,
        i % 3 === 0 ? palette.blossom : palette.flowerA,
        0,
      );
      s.surface(SURFACE.plain);
    }
    return s.build();
  },
};

export const paintedShopSign: Kit = {
  id: 'shop-sign',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 27);
    const s = new ShapeBuilder();
    // A painted board hanging from an iron bracket on a post: cream field, gold border, a loaf.
    s.rbox(-0.03, 0, -0.03, 0.03, 0.62, 0.03, palette.navy, 0.008);
    s.cylinder(0, 0, 0.045, 0.035, 0, 0.05, palette.stone, 6);
    beam(s, [0, 0.6, 0], [0.26, 0.6, 0], 0.014, palette.metal);
    beam(s, [0.04, 0.5, 0], [0.18, 0.6, 0], 0.01, palette.metal);
    s.blob(0.26, 0.6, 0, 0.02, 0.02, 0.02, palette.mustard, 0);
    for (const x of [0.12, 0.24]) beam(s, [x, 0.6, 0], [x, 0.54, 0], 0.005, palette.metal);
    s.rbox(0.07, 0.3, -0.018, 0.29, 0.54, 0.018, palette.mustard, 0.01);
    s.box(0.09, 0.32, 0.018, 0.27, 0.52, 0.022, palette.plasterCream);
    s.box(0.09, 0.32, -0.022, 0.27, 0.52, -0.018, palette.plasterCream);
    for (const z of [0.026, -0.026]) {
      s.blob(0.18, 0.42, z, 0.055, 0.035, 0.006, vary(0xc98f4e, rnd, 0.5), 0);
      s.blob(0.18, 0.445, z, 0.04, 0.015, 0.006, palette.mustard, 0);
    }
    return s.build();
  },
};

export const rainBarrel: Kit = {
  id: 'rain-barrel',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 28);
    const s = new ShapeBuilder();
    // A hooped oak barrel on a low stand, full to the brim, with a downpipe feeding it.
    const wood = vary(palette.wood, rnd, 0.5);
    s.cylinder(0, 0, 0.14, 0.17, 0.04, 0.2, wood, 10);
    s.cylinder(0, 0, 0.17, 0.14, 0.2, 0.36, wood, 10);
    for (const y of [0.08, 0.3]) s.cylinder(0, 0, 0.155, 0.158, y, y + 0.03, palette.metal, 10);
    s.cylinder(0, 0, 0.142, 0.142, 0.355, 0.375, palette.waterDeep, 10);
    for (const x of [-0.12, 0.12]) s.box(x - 0.025, 0, -0.06, x + 0.025, 0.04, 0.06, palette.darkWood);
    s.cylinder(0.2, 0, 0.012, 0.012, 0, 0.7, palette.metal, 6);
    beam(s, [0.2, 0.7, 0], [0.1, 0.4, 0], 0.012, palette.metal);
    s.box(-0.19, 0.12, -0.012, -0.15, 0.135, 0.012, palette.metal);
    return s.build();
  },
};

export const toolRack: Kit = {
  id: 'tool-rack',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 29);
    const s = new ShapeBuilder();
    // A timber frame under a plank cap with a spade, a hoe, a saw and a mallet on pegs.
    for (const x of [-0.26, 0.26]) s.rbox(x - 0.025, 0, -0.035, x + 0.025, 0.6, 0.035, palette.timber, 0.008);
    s.rbox(-0.3, 0.58, -0.05, 0.3, 0.64, 0.05, palette.wood, 0.01);
    beam(s, [-0.26, 0.24, 0], [0.26, 0.24, 0], 0.014, palette.darkWood);
    beam(s, [-0.26, 0.44, 0], [0.26, 0.44, 0], 0.014, palette.darkWood);
    const wood = vary(palette.wood, rnd, 0.5);
    beam(s, [-0.17, 0.56, 0.045], [-0.17, 0.16, 0.045], 0.012, wood);
    s.rbox(-0.2, 0.08, 0.04, -0.14, 0.17, 0.05, palette.metal, 0.006);
    beam(s, [-0.06, 0.56, 0.045], [-0.06, 0.12, 0.045], 0.012, wood);
    s.box(-0.06, 0.1, 0.04, 0.02, 0.125, 0.05, palette.metal);
    s.quad(
      [0.1, 0.52, 0.045],
      [0.24, 0.52, 0.045],
      [0.2, 0.3, 0.045],
      [0.1, 0.3, 0.045],
      palette.metal,
      [0, 0, 1],
    );
    s.box(0.07, 0.3, 0.04, 0.115, 0.52, 0.05, wood);
    s.rbox(0.2, 0.22, 0.035, 0.26, 0.29, 0.055, palette.darkWood, 0.008);
    s.blob(0, 0.03, 0.06, 0.1, 0.03, 0.05, palette.leaf, 0);
    return s.build();
  },
};

export const weathervane: Kit = {
  id: 'weathervane',
  kind: 'decor',
  build: () => {
    const s = new ShapeBuilder();
    // A brass vane on a tall iron rod over a stone plinth: compass arms and an arrow with a cockerel.
    s.rbox(-0.1, 0, -0.1, 0.1, 0.12, 0.1, palette.stone, 0.02);
    s.cylinder(0, 0, 0.07, 0.05, 0.12, 0.17, palette.foundation, 8);
    s.cylinder(0, 0, 0.012, 0.01, 0.17, 0.85, palette.metal, 6);
    s.blob(0, 0.55, 0, 0.028, 0.028, 0.028, palette.mustard, 1);
    beam(s, [-0.1, 0.55, 0], [0.1, 0.55, 0], 0.008, palette.mustard);
    beam(s, [0, 0.55, -0.1], [0, 0.55, 0.1], 0.008, palette.mustard);
    for (const [x, z] of [
      [-0.12, 0],
      [0.12, 0],
      [0, -0.12],
      [0, 0.12],
    ] as const)
      s.blob(x, 0.55, z, 0.016, 0.016, 0.016, palette.mustard, 0);
    beam(s, [-0.2, 0.8, 0], [0.2, 0.8, 0], 0.01, palette.mustard);
    for (const out of [1, -1] as const) {
      s.tri([0.2, 0.84, 0], [0.2, 0.76, 0], [0.27, 0.8, 0], palette.mustard, [0, 0, out]);
      s.tri([-0.2, 0.8, 0], [-0.2, 0.9, 0], [-0.3, 0.9, 0], palette.mustard, [0, 0, out]);
    }
    s.blob(0, 0.86, 0, 0.045, 0.04, 0.012, palette.mustard, 1);
    s.blob(0.04, 0.92, 0, 0.018, 0.02, 0.01, palette.accentRed, 0);
    s.blob(-0.05, 0.9, 0, 0.03, 0.025, 0.008, palette.mustard, 0);
    return s.build();
  },
};
