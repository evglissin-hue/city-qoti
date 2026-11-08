// P1 (playtest item 19): the three signature pieces a village's calling unlocks (content/callings.ts).
// House style as decor.ts: small chunky primitives, centered on the origin, a tile across at most.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SURFACE } from '../surface';
import type { Kit } from './types';

/** An upright disc facing +z and -z (a millstone on its edge), with a rim and a hub. */
function upright(s: ShapeBuilder, cx: number, cy: number, z: number, thick: number, r: number, hex: number): void {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p0: V3 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z];
    const p1: V3 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z];
    const q0: V3 = [p0[0], p0[1], z - thick];
    const q1: V3 = [p1[0], p1[1], z - thick];
    const mid = (a0 + a1) / 2;
    s.quad(q0, q1, p1, p0, hex, [Math.cos(mid), Math.sin(mid), 0]);
    s.tri([cx, cy, z], p0, p1, hex, [0, 0, 1]);
    s.tri([cx, cy, z - thick], q1, q0, hex, [0, 0, -1]);
  }
  // The hub hole, a dark plug, and four dressing grooves in the face.
  s.blob(cx, cy, z + 0.006, 0.045, 0.045, 0.012, palette.darkWood, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    beam(
      s,
      [cx + Math.cos(a) * 0.06, cy + Math.sin(a) * 0.06, z + 0.004],
      [cx + Math.cos(a) * (r - 0.03), cy + Math.sin(a) * (r - 0.03), z + 0.004],
      0.004,
      palette.foundation,
    );
  }
}

export const millstoneBench: Kit = {
  id: 'millstone-bench',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 31);
    const s = new ShapeBuilder();
    // A plank seat on two stone blocks, with an old millstone standing on its edge behind it as the
    // back, held by two stub feet. The back faces +z, as the other benches do.
    for (const x of [-0.19, 0.15]) s.rbox(x, 0, -0.05, x + 0.05, 0.12, 0.13, palette.stone, 0.012);
    s.rbox(-0.24, 0.12, -0.06, 0.24, 0.16, 0.15, vary(palette.wood, rnd, 0.6), 0.01);
    s.rbox(-0.22, 0.16, -0.03, 0.22, 0.175, 0.12, vary(palette.wood, rnd, 0.5), 0.008);
    for (const x of [-0.12, 0.12]) s.rbox(x - 0.03, 0, -0.17, x + 0.03, 0.06, -0.09, palette.foundation, 0.01);
    upright(s, 0, 0.25, -0.09, 0.05, 0.2, palette.stone);
    // A little flour dust left in the grooves, and a sack someone has sat the cat on.
    s.blob(0.3, 0.07, 0.02, 0.07, 0.07, 0.06, palette.plasterCream, 0);
    s.rbox(0.27, 0.0, -0.02, 0.33, 0.015, 0.06, palette.wood, 0.004);
    return s.build();
  },
};

export const roseArch: Kit = {
  id: 'rose-arch',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 32);
    const s = new ShapeBuilder();
    // Two posts and a round-topped frame of slim beams, thick with leaves and roses.
    const w = 0.22;
    const spring = 0.42;
    for (const x of [-w, w]) {
      s.cylinder(x, 0, 0.03, 0.03, 0, spring, palette.timber, 6);
      s.blob(x, 0.045, 0, 0.07, 0.04, 0.07, palette.leaf, 0);
    }
    const n = 9;
    let prev: V3 = [-w, spring, 0];
    for (let i = 1; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      const p: V3 = [Math.cos(a) * w, spring + Math.sin(a) * 0.2, 0];
      beam(s, prev, p, 0.014, palette.timber);
      prev = p;
    }
    // Cross slats between the posts, so the climber has something to hold.
    for (const y of [0.14, 0.28]) {
      for (const z of [-0.012, 0.012]) beam(s, [-w, y, z], [w, y, z], 0.006, palette.timber);
    }
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      const x = Math.cos(a) * w;
      const y = spring + Math.sin(a) * 0.2;
      s.blob(x, y, (rnd() - 0.5) * 0.04, 0.06, 0.05, 0.05, vary(palette.leaf, rnd, 0.5), 0);
    }
    s.surface(SURFACE.flowers);
    const roses = [palette.flowerA, palette.blossom, palette.flowerGeranium, palette.flowerA];
    for (let i = 0; i < 12; i++) {
      const t = (i + rnd() * 0.6) / 11;
      const a = Math.PI - t * Math.PI;
      const onArch = i % 3 !== 0;
      const x = onArch ? Math.cos(a) * w : (i % 2 === 0 ? -w : w) + (rnd() - 0.5) * 0.04;
      const y = onArch ? spring + Math.sin(a) * 0.2 : 0.05 + rnd() * spring;
      s.blob(x, y + 0.02, 0.045 + rnd() * 0.01, 0.026, 0.026, 0.022, roses[i % roses.length]!, 0);
    }
    s.surface(SURFACE.plain);
    return s.build();
  },
};

export const waysideShrine: Kit = {
  id: 'wayside-shrine',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 33);
    const s = new ShapeBuilder();
    // A knee-high stone plinth, a squat pillar with a little niche, a slate gable on top and a
    // candle that is lit every night. Flowers left at the foot by whoever passed.
    s.rbox(-0.15, 0, -0.12, 0.15, 0.07, 0.12, palette.foundation, 0.015);
    s.rbox(-0.12, 0.07, -0.09, 0.12, 0.11, 0.09, palette.stone, 0.012);
    s.rbox(-0.09, 0.11, -0.065, 0.09, 0.4, 0.065, vary(palette.stone, rnd, 0.5), 0.012);
    // The niche: a dark recess with a ledge, and the candle in it.
    s.box(-0.045, 0.2, 0.06, 0.045, 0.34, 0.072, palette.darkWood);
    s.rbox(-0.055, 0.19, 0.055, 0.055, 0.2, 0.085, palette.stone, 0.004);
    s.glow(2);
    s.cylinder(0, 0.07, 0.014, 0.012, 0.2, 0.25, palette.lantern, 6);
    s.blob(0, 0.265, 0.07, 0.014, 0.022, 0.014, palette.lantern, 0);
    s.glow(0);
    s.gable(-0.14, -0.1, 0.14, 0.1, 0.4, 0.52, palette.roofSlate, true);
    s.rbox(-0.015, 0.515, -0.015, 0.015, 0.56, 0.015, palette.metal, 0.004);
    beam(s, [-0.03, 0.54, 0], [0.03, 0.54, 0], 0.004, palette.metal);
    s.surface(SURFACE.flowers);
    s.blob(-0.1, 0.09, 0.13, 0.03, 0.025, 0.025, palette.flowerB, 0);
    s.blob(0.08, 0.09, 0.14, 0.03, 0.025, 0.025, palette.flowerD, 0);
    s.surface(SURFACE.plain);
    return s.build();
  },
};
