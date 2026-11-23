// R3X: the master's sign. A small board that hangs at a business's or workshop's door while a master
// works there, painted with their trade's emblem (docs/build/r3-wave-notes.md, R3B and R3F). A kit
// for the dressing layer. Against a wall (the foot of its arm at z 0, where it touches the wall, the
// street at +z): a plate, a short arm with a brace, and a rail across its end, the board hanging from
// the rail on two chains parallel to the wall, its face to the street. `SIGN_SIZE` in facade.ts is
// its size, which the layer fits to the wall. With `post`: the same board on a timber post, for a
// facade with no wall to hang it on. The board is painted on both faces: a teal frame, a gold bead,
// a cream face and the emblem.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam } from '../shapes';
import { SIGN_SIZE } from '../facade';
import { SURFACE } from '../surface';
import { farBox } from './decorFar';
import type { Kit } from './types';

/** One motif's drawing calls, in emblem units (1 unit is 0.052 tile) from the middle of the face. */
interface Em {
  fan(cx: number, cy: number, rx: number, ry: number, n: number, hex: number): void;
  rect(x0: number, y0: number, x1: number, y1: number, hex: number): void;
  tri(
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
    hex: number,
  ): void;
  quad(
    a: readonly [number, number],
    b: readonly [number, number],
    c: readonly [number, number],
    d: readonly [number, number],
    hex: number,
  ): void;
}

interface Emblem {
  /** The one flat color the far level paints. */
  main: number;
  draw: (e: Em) => void;
}

const CREAM = 0xeadcb8;
const WOOD = 0x9a6b43;
const IRON = 0x4a4640;
const GREEN = 0x5c8a3a;
const GOLD = 0xd9b24a;

/** Every trade and building a master can have, by the trade id (or def id) the dressing passes. */
const EMBLEMS: Readonly<Record<string, Emblem>> = {
  // A loaf, scored three times.
  baker: {
    main: 0xd9a55c,
    draw: (e) => {
      e.fan(0, -0.1, 1.7, 0.95, 12, 0xb9803f);
      e.fan(0, 0.05, 1.45, 0.72, 12, 0xd9a55c);
      for (const x of [-0.75, 0, 0.75])
        e.quad([x - 0.1, -0.2], [x + 0.1, -0.2], [x + 0.35, 0.4], [x + 0.15, 0.4], 0xf0d89c);
    },
  },
  // A handsaw: tapered blade, teeth, a handle with a hole.
  carpenter: {
    main: 0xaab2b8,
    draw: (e) => {
      e.quad([-1.8, 0.4], [0.9, 0.4], [0.9, -0.25], [-1.8, -0.05], 0xaab2b8);
      for (let i = 0; i < 6; i++) {
        const x = -1.75 + i * 0.44;
        const y = (px: number): number => -0.05 - ((px + 1.8) / 2.7) * 0.2;
        e.tri([x, y(x)], [x + 0.44, y(x + 0.44)], [x + 0.22, y(x + 0.22) - 0.22], 0x7d868c);
      }
      e.quad([0.9, 0.5], [1.85, 0.5], [1.85, -0.55], [0.9, -0.3], WOOD);
      e.fan(1.4, 0.05, 0.24, 0.24, 6, CREAM);
    },
  },
  // A candle on a dish, flame lit.
  chandler: {
    main: 0xf3ead2,
    draw: (e) => {
      e.rect(-0.7, -1.2, 0.7, -0.95, 0x8a6a3a);
      e.rect(-0.4, -0.95, 0.4, 0.5, 0xf3ead2);
      e.tri([-0.4, 0.5], [-0.1, 0.5], [-0.4, 0.0], 0xe3d6b4);
      e.rect(-0.03, 0.5, 0.03, 0.66, IRON);
      e.tri([-0.27, 0.62], [0.27, 0.62], [0, 1.4], 0xe9a63a);
      e.tri([-0.13, 0.66], [0.13, 0.66], [0, 1.05], 0xf7d77a);
    },
  },
  // A stoneware jug with an apple on its belly.
  'cider-maker': {
    main: 0xb08357,
    draw: (e) => {
      e.fan(0, -0.4, 1.0, 0.9, 10, 0xb08357);
      e.rect(-0.38, 0.3, 0.38, 1.0, 0xb08357);
      e.rect(-0.5, 1.0, 0.5, 1.22, 0x8a6240);
      e.fan(0, -0.45, 0.42, 0.42, 8, 0xc7432f);
      e.tri([0.04, -0.05], [0.5, 0.1], [0.2, -0.2], GREEN);
    },
  },
  // A wheel of cheese with a wedge cut and a few holes.
  dairy: {
    main: 0xe8c862,
    draw: (e) => {
      e.fan(0, 0, 1.55, 1.15, 14, 0xc79a45);
      e.fan(0, 0, 1.33, 0.95, 14, 0xe8c862);
      e.tri([0, 0], [1.25, 0.6], [1.25, -0.6], 0xf4e4a6);
      for (const [x, y, r] of [
        [-0.6, 0.3, 0.2],
        [-0.35, -0.4, 0.15],
        [0.3, 0.55, 0.13],
      ] as const)
        e.fan(x, y, r, r, 5, 0xc79a45);
    },
  },
  // A fish, nose to the left.
  fishery: {
    main: 0x5f86a0,
    draw: (e) => {
      e.fan(-0.15, 0, 1.3, 0.75, 12, 0x5f86a0);
      e.fan(-0.15, -0.28, 1.0, 0.38, 10, 0xcfdde0);
      e.tri([1.0, 0], [1.9, 0.75], [1.9, -0.75], 0x4e7391);
      e.tri([-0.4, 0.65], [0.3, 0.65], [0.1, 1.2], 0x4e7391);
      e.fan(-0.85, 0.18, 0.14, 0.14, 5, 0x1f2a30);
      e.tri([-0.55, 0.45], [-0.4, 0.45], [-0.5, -0.4], 0x4e7391);
    },
  },
  // A fir in three tiers on a trunk.
  'foresters-lodge': {
    main: 0x4b7a50,
    draw: (e) => {
      e.rect(-0.2, -1.25, 0.2, -0.45, 0x6b4a30);
      e.tri([-1.3, -0.4], [1.3, -0.4], [0, 0.4], palette.pine);
      e.tri([-1.0, 0.1], [1.0, 0.1], [0, 0.95], 0x4b7a50);
      e.tri([-0.72, 0.6], [0.72, 0.6], [0, 1.4], 0x578a5a);
    },
  },
  // A sheaf: five stalks fanned from a tie.
  'grain-farm': {
    main: 0xe0b84a,
    draw: (e) => {
      for (const tx of [-1.25, -0.62, 0, 0.62, 1.25]) {
        const ty = 0.7 - Math.abs(tx) * 0.12;
        e.quad([-0.06, -1.15], [0.06, -1.15], [tx * 0.8 + 0.05, ty], [tx * 0.8 - 0.05, ty], 0xc9a64a);
        e.tri([tx * 0.8 - 0.19, ty - 0.05], [tx * 0.8 + 0.19, ty - 0.05], [tx * 0.8, ty + 0.62], 0xe0b84a);
      }
      e.rect(-0.45, -0.55, 0.45, -0.33, 0x9c4f43);
    },
  },
  // A bee: striped body, two wings, a stinger.
  hives: {
    main: 0xe0a82e,
    draw: (e) => {
      e.fan(-0.2, 0.75, 0.6, 0.4, 8, 0xdbe9ef);
      e.fan(0.4, 0.78, 0.52, 0.36, 8, 0xdbe9ef);
      e.fan(0, -0.15, 1.2, 0.72, 12, 0xe0a82e);
      for (const x of [-0.6, 0.0, 0.6]) e.rect(x - 0.12, -0.62, x + 0.12, 0.3, 0x3a2c1e);
      e.tri([1.15, -0.1], [1.15, -0.3], [1.65, -0.2], 0x3a2c1e);
      e.fan(-0.85, -0.05, 0.12, 0.12, 5, 0x1f2a30);
    },
  },
  // A carrot with its tops.
  'market-garden': {
    main: 0xdd7a2e,
    draw: (e) => {
      e.tri([-0.55, 0.6], [0.55, 0.6], [0.05, -1.3], 0xdd7a2e);
      for (const y of [0.2, -0.25, -0.7])
        e.rect(-0.22 + (0.2 - y) * 0.15, y, 0.1 + (0.2 - y) * 0.1, y + 0.07, 0xc4601f);
      e.tri([-0.35, 0.6], [-0.05, 0.6], [-0.7, 1.35], GREEN);
      e.tri([-0.15, 0.6], [0.15, 0.6], [0, 1.45], 0x6f9a4a);
      e.tri([0.05, 0.6], [0.35, 0.6], [0.7, 1.35], GREEN);
    },
  },
  // An apple with a leaf.
  orchard: {
    main: 0xc7432f,
    draw: (e) => {
      e.fan(0, -0.2, 1.15, 1.0, 12, 0xc7432f);
      e.fan(-0.45, 0.1, 0.28, 0.36, 6, 0xe0745c);
      e.tri([-0.35, 0.78], [0.35, 0.78], [0, 0.5], 0xa83a29);
      e.rect(-0.06, 0.7, 0.06, 1.25, 0x5b4232);
      e.tri([0.06, 1.0], [0.95, 1.35], [0.55, 0.78], GREEN);
    },
  },
  // A pick: haft and a heavy head with two points.
  quarry: {
    main: 0x8c949a,
    draw: (e) => {
      e.rect(-0.13, -1.3, 0.13, 0.75, WOOD);
      e.quad([-1.2, 0.5], [1.2, 0.5], [1.2, 0.95], [-1.2, 0.95], 0x8c949a);
      e.tri([-1.2, 0.5], [-1.2, 0.95], [-1.95, 0.4], 0x8c949a);
      e.tri([1.2, 0.5], [1.2, 0.95], [1.95, 0.4], 0x8c949a);
      e.rect(-0.38, 0.4, 0.38, 1.05, 0x6e757b);
    },
  },
  // A sheep: a cloud of fleece, dark face and legs.
  'sheep-run': {
    main: 0xf4efe4,
    draw: (e) => {
      e.rect(-0.75, -1.2, -0.5, -0.6, 0x4a3a2c);
      e.rect(0.5, -1.2, 0.75, -0.6, 0x4a3a2c);
      for (const [x, y, r] of [
        [-0.75, 0.05, 0.6],
        [0, 0.25, 0.68],
        [0.75, 0.05, 0.6],
        [-0.4, -0.3, 0.6],
        [0.4, -0.3, 0.6],
      ] as const)
        e.fan(x, y, r, r * 0.92, 8, 0xf4efe4);
      e.fan(1.5, 0.0, 0.4, 0.52, 6, 0x4a3a2c);
      e.tri([1.2, 0.35], [1.1, 0.7], [1.45, 0.45], 0x4a3a2c);
    },
  },
  // A pair of scales.
  shop: {
    main: 0xd9b24a,
    draw: (e) => {
      e.rect(-0.1, -1.2, 0.1, 1.0, 0x6e4a2e);
      e.rect(-0.65, -1.35, 0.65, -1.15, 0x6e4a2e);
      e.rect(-1.55, 0.85, 1.55, 1.05, IRON);
      e.tri([-1.2, 0.9], [-1.78, -0.35], [-0.62, -0.35], 0xf3e2a0);
      e.tri([1.2, 0.9], [0.62, -0.35], [1.78, -0.35], 0xf3e2a0);
      e.quad([-1.85, -0.35], [-0.55, -0.35], [-0.75, -0.65], [-1.65, -0.65], GOLD);
      e.quad([0.55, -0.35], [1.85, -0.35], [1.65, -0.65], [0.75, -0.65], GOLD);
    },
  },
  // A spool of thread with a loose end.
  weaver: {
    main: 0xa4574a,
    draw: (e) => {
      e.rect(-0.95, 0.7, 0.95, 1.0, WOOD);
      e.rect(-0.95, -1.0, 0.95, -0.7, WOOD);
      e.rect(-0.68, -0.7, 0.68, 0.7, 0xa4574a);
      for (const y of [-0.4, 0.05, 0.5]) e.rect(-0.68, y, 0.68, y + 0.13, 0xc47c70);
      e.quad([0.68, -0.5], [0.68, -0.64], [1.75, -1.15], [1.75, -1.0], 0xa4574a);
    },
  },
  // Four sails on a hub.
  windmill: {
    main: 0xefe3cc,
    draw: (e) => {
      e.rect(-0.06, -1.3, 0.06, 1.3, 0x6e4a2e);
      e.rect(-1.75, -0.06, 1.75, 0.06, 0x6e4a2e);
      e.rect(0.06, 0.3, 0.55, 1.25, 0xefe3cc);
      e.rect(0.3, -0.55, 1.65, -0.06, 0xefe3cc);
      e.rect(-0.55, -1.25, -0.06, -0.3, 0xefe3cc);
      e.rect(-1.65, 0.06, -0.3, 0.55, 0xefe3cc);
      e.fan(0, 0, 0.28, 0.28, 6, 0x5b4232);
    },
  },
};

/** The motif a trade or building with no emblem of its own gets: a sprig. */
const SPRIG: Emblem = {
  main: GREEN,
  draw: (e) => {
    e.rect(-0.05, -1.2, 0.05, 0.9, 0x6b4a30);
    for (const [x, y, s] of [
      [-0.55, 0.3, 1],
      [0.55, 0.0, -1],
      [-0.55, -0.45, 1],
      [0.55, -0.7, -1],
    ] as const)
      e.tri([0, y - 0.2], [x * 2.2, y + 0.45], [x * 0.35, y + 0.3 * s], GREEN);
    e.tri([-0.4, 0.85], [0.4, 0.85], [0, 1.5], 0x6f9a4a);
  },
};

/** The trades and buildings that have an emblem, alphabetical (a test keeps it equal to the masters'). */
export const MASTER_EMBLEMS: readonly string[] = Object.keys(EMBLEMS);

const { reach: A, armY: ARM_Y, boardW: BW, boardH: BH } = SIGN_SIZE;
/** On its own post (a facade with no wall to hang it on), the board's lower edge stands this high. */
export const POST_HANG = 0.5;
/** One emblem unit, tiles: the face is about 4.5 units across and 3.2 high. */
const K = 0.052;
const YC = BH / 2;
/** Half the board's thickness, and how far inside its edge the painted face begins. */
const T = 0.014;
const INSET = 0.012;
/** Where the post stands when the sign is on one: left of the board. */
const POST_X = -0.2;

export const masterSign: Kit = {
  id: 'master-sign',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 71);
    const key = typeof opts?.params?.emblem === 'string' ? opts.params.emblem : '';
    const em = EMBLEMS[key] ?? SPRIG;
    const s = new ShapeBuilder(opts?.lod ?? 'high');
    const frame = vary(palette.teal, rnd, 0.4);
    const face = vary(CREAM, rnd, 0.3);
    const wood = vary(palette.timber, rnd, 0.4);
    // On a wall the board hangs `A` out from it on an arm. On a post (a facade with no wall to hang it
    // on) it hangs from a rail off a timber post at its left, `oy` up from the ground.
    const post = opts?.params?.post === true;
    const oy = post ? POST_HANG : 0;
    const armY = ARM_Y + oy;
    const zb = post ? 0 : A;
    const hw = BW / 2;
    s.levels(
      () => {
        s.surface(SURFACE.wroughtIron);
        if (post) {
          s.surface(SURFACE.woodGrain);
          s.rbox(POST_X - 0.04, 0, -0.04, POST_X + 0.04, 0.05, 0.04, palette.stone, 0.008);
          beam(s, [POST_X, 0.05, 0], [POST_X, armY + 0.025, 0], 0.02, wood);
          s.surface(SURFACE.wroughtIron);
          beam(s, [POST_X, armY, 0], [hw + 0.04, armY, 0], 0.011, palette.metal);
          beam(s, [POST_X, armY - 0.09, 0], [POST_X + 0.09, armY, 0], 0.006, palette.metal);
        } else {
          // The plate on the wall, the arm out from it with a brace under, and the rail across its end.
          s.box(-0.03, armY - 0.03, -0.012, 0.03, armY + 0.03, 0.008, palette.metal);
          beam(s, [0, armY, 0], [0, armY, A], 0.011, palette.metal);
          beam(s, [0, armY - 0.085, 0], [0, armY - 0.005, A * 0.7], 0.006, palette.metal);
          beam(s, [-hw - 0.04, armY, A], [hw + 0.04, armY, A], 0.011, palette.metal);
        }
        // Two short chains carry the board.
        for (const x of [-hw + 0.035, hw - 0.035])
          beam(s, [x, BH + oy, zb], [x, armY - 0.008, zb], 0.0035, palette.metal);
        // The board: a teal frame, a gold bead round the painted face on both sides.
        s.surface(SURFACE.paintedWood);
        s.box(-hw, oy, zb - T, hw, BH + oy, zb + T, frame, 'b');
        s.surface(SURFACE.plain);
        for (const side of [1, -1] as const) {
          const z = zb + side * (T + 0.0003);
          // A quad on this side's plane, wound to face outward (+z on the front, -z on the back).
          const rect = (x0: number, y0: number, x1: number, y1: number, hex: number, dz: number): void => {
            const zz = z + side * dz;
            if (side > 0)
              s.quad(
                [x0, y0 + oy, zz],
                [x1, y0 + oy, zz],
                [x1, y1 + oy, zz],
                [x0, y1 + oy, zz],
                hex,
                [0, 0, 1],
              );
            else
              s.quad(
                [x1, y0 + oy, zz],
                [x0, y0 + oy, zz],
                [x0, y1 + oy, zz],
                [x1, y1 + oy, zz],
                hex,
                [0, 0, -1],
              );
          };
          rect(-hw + INSET, INSET, hw - INSET, BH - INSET, face, 0);
          const b = 0.007;
          rect(-hw + INSET, INSET, hw - INSET, INSET + b, GOLD, 0.0003);
          rect(-hw + INSET, BH - INSET - b, hw - INSET, BH - INSET, GOLD, 0.0003);
          rect(-hw + INSET, INSET + b, -hw + INSET + b, BH - INSET - b, GOLD, 0.0003);
          rect(hw - INSET - b, INSET + b, hw - INSET, BH - INSET - b, GOLD, 0.0003);
          // The emblem, to the viewer's right: +x on the front, -x on the back.
          let layer = 0;
          const dz = (): number => 0.0006 + layer++ * 0.0003;
          const px = (u: number): number => side * u * K;
          const py = (v: number): number => YC + oy + v * K;
          const tri = (
            a: readonly [number, number],
            b2: readonly [number, number],
            c: readonly [number, number],
            hex: number,
          ): void => {
            const zz = z + side * dz();
            const pts: V3[] = [
              [px(a[0]), py(a[1]), zz],
              [px(b2[0]), py(b2[1]), zz],
              [px(c[0]), py(c[1]), zz],
            ];
            s.tri(pts[0]!, pts[1]!, pts[2]!, hex, [0, 0, side]);
          };
          em.draw({
            fan: (cx, cy, rx, ry, n, hex) => {
              for (let i = 0; i < n; i++) {
                const a0 = (i / n) * Math.PI * 2;
                const a1 = ((i + 1) / n) * Math.PI * 2;
                tri(
                  [cx, cy],
                  [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry],
                  [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry],
                  hex,
                );
              }
            },
            rect: (x0, y0, x1, y1, hex) => {
              tri([x0, y0], [x1, y0], [x1, y1], hex);
              tri([x0, y0], [x1, y1], [x0, y1], hex);
            },
            tri,
            quad: (a, b2, c, d, hex) => {
              tri(a, b2, c, hex);
              tri(a, c, d, hex);
            },
          });
        }
      },
      () => {
        s.surface(SURFACE.wroughtIron);
        farBox(
          s,
          -hw - 0.04,
          armY - 0.011,
          zb - 0.011,
          hw + 0.04,
          armY + 0.011,
          zb + 0.011,
          palette.metal,
          'bk',
        );
        if (post) {
          s.surface(SURFACE.woodGrain);
          farBox(s, POST_X - 0.02, 0, -0.02, POST_X + 0.02, armY + 0.025, 0.02, wood, 'b');
        } else farBox(s, -0.011, armY - 0.011, 0, 0.011, armY + 0.011, A, palette.metal, 'bk');
        s.surface(SURFACE.paintedWood);
        farBox(s, -hw, oy, zb - T, hw, BH + oy, zb + T, frame, 'b');
        s.surface(SURFACE.plain);
        for (const side of [1, -1] as const) {
          const zz = zb + side * (T + 0.0005);
          const y0 = YC + oy - 0.05;
          const y1 = YC + oy + 0.05;
          if (side > 0)
            s.quad([-0.08, y0, zz], [0.08, y0, zz], [0.08, y1, zz], [-0.08, y1, zz], em.main, [0, 0, 1]);
          else s.quad([0.08, y0, zz], [-0.08, y0, zz], [-0.08, y1, zz], [0.08, y1, zz], em.main, [0, 0, -1]);
        }
      },
    );
    return s.build();
  },
};
