// Garden and street decor added in I1 (Pattern Book pieces and friends): a birdbath, curved and ring
// benches, a hanging lantern on a crook, a herb planter, a mooring post, a planter wall and a
// wildflower verge. Centered on the origin; linear pieces run along +x from -0.5 to 0.5.
import { seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import type { Kit } from './types';

const BLOOMS = [palette.flowerA, palette.flowerB, palette.flowerC, palette.flowerD, palette.blossom];

export const birdbath: Kit = {
  id: 'birdbath',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 31);
    const stone = vary(palette.stone, rnd, 0.6);
    const s = new ShapeBuilder();
    s.cylinder(0, 0, 0.09, 0.08, 0, 0.04, vary(stone, rnd, 1.2), 8);
    s.cylinder(0, 0, 0.045, 0.035, 0.04, 0.24, stone, 8);
    s.cylinder(0, 0, 0.06, 0.15, 0.24, 0.29, vary(stone, rnd, 0.8), 10);
    s.cylinder(0, 0, 0.15, 0.15, 0.29, 0.31, stone, 10);
    s.cylinder(0, 0, 0.12, 0.12, 0.3, 0.305, palette.waterShallow, 10);
    // A robin on the rim.
    s.blob(0.12, 0.34, 0.02, 0.025, 0.022, 0.03, 0x7a5a43, 0);
    s.blob(0.13, 0.335, 0.04, 0.016, 0.014, 0.012, palette.accentRed, 0);
    s.blob(0.12, 0.365, 0.045, 0.014, 0.014, 0.014, 0x6b4a33, 0);
    s.blob(-0.03, 0.03, 0.1, 0.05, 0.03, 0.04, vary(palette.leaf, rnd), 0);
    return s.build();
  },
};

/** Bench slats along an arc of `radius`, from angle a0 to a1 (radians, 0 is +z), back to the outside. */
function arcBench(
  s: ShapeBuilder,
  radius: number,
  a0: number,
  a1: number,
  wood: number,
  backInside: boolean,
): void {
  const seg = Math.max(3, Math.round(((a1 - a0) * radius) / 0.12));
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const p = (a: number, r: number, y: number): [number, number, number] => [
      Math.sin(a) * r,
      y,
      Math.cos(a) * r,
    ];
    const r0 = radius - 0.06;
    const r1 = radius + 0.06;
    s.quad(p(t0, r0, 0.13), p(t1, r0, 0.13), p(t1, r1, 0.13), p(t0, r1, 0.13), wood, [0, 1, 0]);
    s.quad(
      p(t0, r0, 0.11),
      p(t1, r0, 0.11),
      p(t1, r1, 0.11),
      p(t0, r1, 0.11),
      vary(wood, () => 0.2, 1),
      [0, -1, 0],
    );
    const rb = backInside ? r0 - 0.005 : r1 + 0.005;
    s.quad(
      p(t0, rb, 0.16),
      p(t1, rb, 0.16),
      p(t1, rb, 0.25),
      p(t0, rb, 0.25),
      wood,
      backInside ? [-Math.sin(t0), 0, -Math.cos(t0)] : [Math.sin(t0), 0, Math.cos(t0)],
    );
    s.quad(
      p(t0, rb, 0.16),
      p(t1, rb, 0.16),
      p(t1, rb, 0.25),
      p(t0, rb, 0.25),
      wood,
      backInside ? [Math.sin(t0), 0, Math.cos(t0)] : [-Math.sin(t0), 0, -Math.cos(t0)],
    );
  }
  for (let i = 0; i <= seg; i += Math.max(1, Math.floor(seg / 3))) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const x = Math.sin(a) * radius;
    const z = Math.cos(a) * radius;
    s.box(x - 0.02, 0, z - 0.02, x + 0.02, 0.12, z + 0.02, palette.timber);
    const rb = backInside ? radius - 0.06 : radius + 0.06;
    beam(
      s,
      [Math.sin(a) * rb, 0.11, Math.cos(a) * rb],
      [Math.sin(a) * rb, 0.26, Math.cos(a) * rb],
      0.012,
      palette.timber,
    );
  }
}

export const curvedBench: Kit = {
  id: 'curved-bench',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 32);
    const s = new ShapeBuilder();
    // A gentle crescent: seat faces -z (toward the arc's center), back to +z.
    arcBench(s, 0.32, -0.75, 0.75, vary(palette.wood, rnd, 0.6), false);
    const g = s.build();
    return g.translate(0, 0, -0.18);
  },
};

export const ringBench: Kit = {
  id: 'ring-bench',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 33);
    const s = new ShapeBuilder();
    // A full ring with its back to the middle, made to sit around a tree trunk.
    arcBench(s, 0.3, 0, Math.PI * 2, vary(palette.wood, rnd, 0.6), true);
    return s.build();
  },
};

export const hangingLantern: Kit = {
  id: 'hanging-lantern',
  kind: 'decor',
  build: () => {
    const s = new ShapeBuilder();
    // A shepherd's crook post with a lantern on a short chain.
    s.cylinder(0, 0, 0.05, 0.045, 0, 0.04, palette.stone, 8);
    beam(s, [0, 0, 0], [0, 0.62, 0], 0.016, palette.metal);
    beam(s, [0, 0.62, 0], [0.06, 0.68, 0], 0.012, palette.metal);
    beam(s, [0.06, 0.68, 0], [0.14, 0.66, 0], 0.012, palette.metal);
    beam(s, [0.14, 0.66, 0], [0.14, 0.58, 0], 0.004, palette.metal);
    s.box(0.1, 0.565, -0.04, 0.18, 0.58, 0.04, palette.metal);
    s.glow(2);
    s.box(0.108, 0.48, -0.032, 0.172, 0.565, 0.032, palette.lantern);
    s.glow(0);
    s.box(0.1, 0.47, -0.04, 0.18, 0.485, 0.04, palette.metal);
    s.blob(0.03, 0.04, 0.04, 0.05, 0.03, 0.04, palette.leaf, 0);
    s.blob(0.05, 0.06, 0.05, 0.02, 0.018, 0.02, palette.flowerC, 0);
    return s.build();
  },
  anchors: () => ({ lights: [[0.14, 0.52, 0]] }),
};

export const herbPlanter: Kit = {
  id: 'herb-planter',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 34);
    const s = new ShapeBuilder();
    s.rbox(-0.17, 0, -0.1, 0.17, 0.12, 0.1, vary(palette.wood, rnd, 0.6), 0.012);
    s.box(-0.15, 0.1, -0.08, 0.15, 0.125, 0.08, palette.soil);
    for (const x of [-0.17, 0.17]) s.box(x - 0.012, 0, -0.105, x + 0.012, 0.13, 0.105, palette.timber);
    // Rosemary, sage, chives and a spike of lavender.
    s.blob(-0.1, 0.16, 0, 0.05, 0.05, 0.05, vary(0x6f8f5a, rnd, 0.6), 1);
    s.blob(0.0, 0.15, 0.02, 0.05, 0.035, 0.05, vary(0x9cae8a, rnd, 0.6), 0);
    for (let i = 0; i < 4; i++)
      beam(
        s,
        [0.08 + i * 0.015, 0.12, -0.03 + i * 0.015],
        [0.08 + i * 0.02, 0.24, -0.04 + i * 0.02],
        0.006,
        0x6aa04a,
      );
    for (let i = 0; i < 3; i++) {
      const x = -0.03 + i * 0.05;
      beam(s, [x, 0.12, -0.05], [x, 0.22, -0.06], 0.005, 0x7d9a64);
      s.cylinder(x, -0.06, 0.012, 0.004, 0.2, 0.25, 0x9a82c8, 4);
    }
    return s.build();
  },
};

export const mooringPost: Kit = {
  id: 'mooring-post',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 35);
    const s = new ShapeBuilder();
    s.cylinder(0, 0, 0.07, 0.06, 0, 0.42, vary(palette.darkWood, rnd, 0.6), 8);
    s.cylinder(0, 0, 0.065, 0.065, 0.42, 0.45, palette.metal, 8);
    // A coil of rope around the post and a line trailing off.
    for (const y of [0.22, 0.25]) s.cylinder(0, 0, 0.078, 0.078, y, y + 0.025, 0xbfa27a, 8);
    beam(s, [0.07, 0.235, 0], [0.32, 0.03, 0.06], 0.008, 0xbfa27a);
    s.blob(-0.05, 0.03, 0.06, 0.04, 0.03, 0.04, vary(0x5f7f5a, rnd), 0);
    return s.build();
  },
};

export const planterWall: Kit = {
  id: 'planter-wall',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 36);
    const s = new ShapeBuilder();
    // A low wall of stones with a trough of flowers on top, trailing a little over the edge.
    let x = -0.5;
    let row = 0;
    while (x < 0.5 - 0.001) {
      const len = Math.min(0.5 - x, 0.2 + (row++ % 2) * 0.05);
      s.rbox(x + 0.004, 0, -0.1, x + len - 0.004, 0.12, 0.1, vary(palette.stone, rnd, 1.4), 0.015);
      x += len;
    }
    s.box(-0.5, 0.12, -0.1, 0.5, 0.17, 0.1, vary(palette.foundation, rnd, 0.6));
    s.box(-0.48, 0.17, -0.07, 0.48, 0.185, 0.07, palette.soil);
    for (let i = 0; i < 7; i++) {
      const px = -0.42 + i * 0.14 + (rnd() - 0.5) * 0.03;
      s.blob(px, 0.21, 0, 0.07, 0.045, 0.07, vary(palette.leaf, rnd, 0.8), 0);
      s.blob(
        px + 0.02,
        0.25,
        (rnd() - 0.5) * 0.06,
        0.03,
        0.025,
        0.03,
        BLOOMS[Math.floor(rnd() * BLOOMS.length)]!,
        0,
      );
      if (i % 2 === 0) s.blob(px, 0.14, 0.1, 0.03, 0.05, 0.015, vary(palette.birchLeaf, rnd), 0);
    }
    return s.build();
  },
};

export const wildflowerVerge: Kit = {
  id: 'wildflower-verge',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 37);
    const s = new ShapeBuilder();
    // Long grass in tufts with poppies, cornflowers, daisies and buttercups.
    for (let i = 0; i < 10; i++) {
      const x = -0.45 + i * 0.1 + (rnd() - 0.5) * 0.05;
      const z = (rnd() - 0.5) * 0.18;
      s.cylinder(x, z, 0.04, 0, 0, 0.1 + rnd() * 0.07, vary(palette.meadow, rnd, 1.2), 4, rnd());
    }
    const wild = [0xd9473b, 0x5f86d0, palette.white, 0xf0c93a, palette.flowerC];
    for (let i = 0; i < 14; i++) {
      const x = -0.46 + rnd() * 0.92;
      const z = (rnd() - 0.5) * 0.22;
      const h = 0.07 + rnd() * 0.09;
      beam(s, [x, 0, z], [x, h, z], 0.004, 0x6a9a48);
      s.blob(x, h, z, 0.022, 0.012, 0.022, wild[Math.floor(rnd() * wild.length)]!, 0);
    }
    return s.build();
  },
};
