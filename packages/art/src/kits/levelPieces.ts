// R3H: the pieces a specialized building adds as it climbs (docs/build/cycle-r3h-specialized-levels.md,
// Task 4). A kit reads `levelOf(opts)` (kits/business.ts) and calls these after its level 1 drawing,
// from a stream of its own, so level 1 stays exactly what it was. Opaque and vertex colored; the big
// pieces (a stack, a lean-to, a derrick) are drawn so they still read at the far level.
import { vary, type ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ } from '../shapes';
import { roofPart, type RoofMaterial } from './roofs';

/** A long pile of logs laid along x (or z) in staggered rows: a block of the right size far off. */
export function logPile(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  rows: number,
  rnd: () => number,
  alongX = true,
): void {
  const r = 0.05;
  s.proxy((t) => {
    const across = Math.max(1, Math.floor(((alongX ? z1 - z0 : x1 - x0) - 0.04) / (r * 2)));
    for (let row = 0; row < rows; row++) {
      const n = Math.max(1, across - (row % 2));
      const off = (row % 2) * r;
      const y = r + row * r * 1.75;
      for (let i = 0; i < n; i++) {
        const c = (alongX ? z0 : x0) + 0.02 + r + off + i * r * 2;
        const col = vary(i % 3 === 0 ? 0xc9a46e : 0x9b7b52, rnd, 0.8);
        if (alongX) cylX(t, x0, x1, y, c, r, col, 6, 0xd9b98a);
        else cylZ(t, z0, z1, c, y, r, col, 6, 0xd9b98a);
      }
    }
  });
}

/** Planks stacked on stickers in a neat block, along x. */
export function plankStack(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  layers: number,
  rnd: () => number,
): void {
  s.proxy((t) => {
    for (const x of [x0 + 0.08, (x0 + x1) / 2, x1 - 0.08])
      t.box(x - 0.025, 0, z0, x + 0.025, 0.04, z1, palette.timber);
    for (let i = 0; i < layers; i++) {
      const y = 0.04 + i * 0.07;
      // Two tans, both under the pale mark (P3C), so the stack reads as wood and never a stand-in.
      t.box(x0, y, z0, x1, y + 0.06, z1, vary(i % 2 ? 0xbc9763 : 0xc9a46e, rnd, 0.7));
    }
  });
}

export interface LeanToSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Low eave and high side heights. */
  lo: number;
  hi: number;
  /** Which side is high (the wall it leans on). */
  high: 'x-' | 'x+' | 'z-' | 'z+';
  material: RoofMaterial;
  color: number;
  /** The back wall's color. */
  wall: number;
}

/** A lean-to: a walled high side, posts on the low side, a single slope of roof over it. */
export function leanTo(s: ShapeBuilder, sp: LeanToSpec, rnd: () => number): void {
  const { x0, z0, x1, z1, lo, hi, high } = sp;
  const alongX = high === 'z-' || high === 'z+';
  // The back wall on the high side.
  if (high === 'z-') s.box(x0, 0, z0, x1, hi, z0 + 0.05, sp.wall);
  else if (high === 'z+') s.box(x0, 0, z1 - 0.05, x1, hi, z1, sp.wall);
  else if (high === 'x-') s.box(x0, 0, z0, x0 + 0.05, hi, z1, sp.wall);
  else s.box(x1 - 0.05, 0, z0, x1, hi, z1, sp.wall);
  // Posts on the low side.
  const lowX = high === 'x-' ? x1 - 0.03 : high === 'x+' ? x0 + 0.03 : null;
  const lowZ = high === 'z-' ? z1 - 0.03 : high === 'z+' ? z0 + 0.03 : null;
  const posts: [number, number][] =
    lowZ !== null
      ? [
          [x0 + 0.03, lowZ],
          [x1 - 0.03, lowZ],
        ]
      : [
          [lowX!, z0 + 0.03],
          [lowX!, z1 - 0.03],
        ];
  for (const [x, z] of posts) beam(s, [x, 0, z], [x, lo, z], 0.024, palette.timber);
  const pad = 0.06;
  roofPart(s, {
    shape: 'lean',
    material: sp.material,
    x0: x0 - pad,
    z0: z0 - pad,
    x1: x1 + pad,
    z1: z1 + pad,
    y0: lo,
    y1: hi,
    color: sp.color,
    trim: palette.timber,
    ridgeAlongX: alongX,
    highAtC1: high === 'z+' || high === 'x+',
    rnd,
  });
}

/**
 * A wooden derrick at (x, z): a mast with two braces, a boom leaning out toward (tx, tz), a rope and
 * a hanging stone. The mast and boom are thick enough to read from the far level.
 */
export function derrick(
  s: ShapeBuilder,
  x: number,
  z: number,
  tx: number,
  tz: number,
  h: number,
  rnd: () => number,
): void {
  s.box(x - 0.04, 0, z - 0.04, x + 0.04, h, z + 0.04, palette.timber);
  for (const [dx, dz] of [
    [-0.28, 0.24],
    [0.28, 0.24],
  ] as const)
    beam(s, [x + dx, 0, z + dz], [x, h * 0.7, z], 0.022, palette.timber);
  const bx = x + (tx - x) * 0.85;
  const bz = z + (tz - z) * 0.85;
  beam(s, [x, h * 0.3, z], [bx, h * 0.97, bz], 0.034, palette.wood);
  beam(s, [x, h, z], [bx, h * 0.97, bz], 0.014, 0xbfa27a);
  s.nearOnly(() => {
    beam(s, [bx, h * 0.95, bz], [bx, h * 0.5, bz], 0.006, 0xbfa27a);
    s.rbox(
      bx - 0.09,
      h * 0.35,
      bz - 0.08,
      bx + 0.09,
      h * 0.5,
      bz + 0.08,
      vary(palette.stone, rnd, 0.8),
      0.015,
    );
  });
}

/** A baled bundle of goods with a rope band, about 0.24 x 0.16 x 0.18. */
export function bale(s: ShapeBuilder, x: number, y: number, z: number, hex: number, rnd: () => number): void {
  s.rbox(x - 0.12, y, z - 0.09, x + 0.12, y + 0.16, z + 0.09, vary(hex, rnd, 0.6), 0.02);
  s.box(x - 0.012, y - 0.002, z - 0.092, x + 0.012, y + 0.162, z + 0.092, 0xbfa27a);
}

/** A small two-wheeled handcart with a loaded bed, its shafts out toward +z. */
export function loadedCart(s: ShapeBuilder, x: number, z: number, hex: number, rnd: () => number): void {
  s.rbox(x - 0.22, 0.14, z - 0.3, x + 0.22, 0.2, z + 0.26, vary(palette.wood, rnd, 0.5), 0.01);
  for (const dx of [-0.25, 0.25]) cylX(s, x + dx - 0.02, x + dx + 0.02, 0.13, z, 0.13, palette.darkWood, 10);
  beam(s, [x - 0.12, 0.17, z + 0.26], [x - 0.12, 0.1, z + 0.58], 0.014, palette.timber);
  beam(s, [x + 0.12, 0.17, z + 0.26], [x + 0.12, 0.1, z + 0.58], 0.014, palette.timber);
  bale(s, x - 0.1, 0.2, z - 0.12, hex, rnd);
  bale(s, x + 0.1, 0.2, z + 0.08, hex, rnd);
  bale(s, x, 0.36, z - 0.02, hex, rnd);
}
