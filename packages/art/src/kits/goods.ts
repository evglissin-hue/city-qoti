// Goods on screen: bundles that porters carry, and stock piles for yards, building sites and stall
// counters. Bundles are figure-space pieces for the resident material (held in front of the chest);
// piles go into building geometry through the plain ShapeBuilder.
import type { BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { RigBuilder, type Channel } from '../rig';
import { cylX } from '../shapes';
import type { Kit } from './types';

export const GOOD_COLORS = {
  bark: 0x6b4a30,
  logEnd: 0xd9b98a,
  plank: 0xd8ae78,
  plankDark: 0xb98d5a,
  stone: 0xb9b1a3,
  wheat: 0xe0bd5c,
  wheatDark: 0xc49a3c,
  sack: 0xece4d2,
  sackTie: 0x9a7a52,
  bread: 0xc98a45,
  breadTop: 0xe0a95e,
  wicker: 0xa8794a,
  cabbage: 0x7fae4e,
  carrot: 0xe2803a,
  beet: 0x9c3a4f,
  fish: 0x9fb4bd,
  fishBelly: 0xe6ecee,
  rope: 0xbfa27a,
  crate: 0xa77b4f,
} as const;

const C = GOOD_COLORS;
const ch = (hex: number): Channel => ({ hex });

/** Ids of goods with their own bundle; anything else is carried as a little crate. */
export const BUNDLE_GOODS = [
  'bread',
  'fish',
  'flour',
  'logs',
  'planks',
  'stone',
  'vegetables',
  'wheat',
] as const;

function logBundle(b: RigBuilder): void {
  for (const [y, z] of [
    [0.02, -0.018],
    [0.02, 0.018],
    [0.05, 0],
  ] as const) {
    b.tube(
      [
        [-0.07, y, z],
        [0.07, y, z],
      ],
      [0.019, 0.019],
      6,
      ch(C.bark),
    );
    for (const x of [-0.07, 0.07]) b.ellipsoid([x, y, z], [0.002, 0.017, 0.017], 6, 1, () => ch(C.logEnd));
  }
  b.tube(
    [
      [0, 0.0, 0],
      [0, 0.075, 0],
    ],
    [0.0, 0.0],
    3,
    ch(C.rope),
  );
  b.ellipsoid([0, 0.035, 0], [0.006, 0.045, 0.042], 6, 2, () => ch(C.rope));
}

function plankBundle(b: RigBuilder): void {
  for (let i = 0; i < 3; i++) {
    const y = i * 0.016;
    const dx = (i % 2) * 0.012 - 0.006;
    b.box(-0.08 + dx, y, -0.03, 0.08 + dx, y + 0.014, 0.03, ch(i % 2 ? C.plankDark : C.plank));
  }
}

function stoneBundle(b: RigBuilder): void {
  b.box(-0.045, 0, -0.035, 0.045, 0.055, 0.035, ch(C.stone));
  b.box(-0.04, 0.055, -0.03, 0.01, 0.07, 0.03, ch(0xa9a193));
}

function wheatBundle(b: RigBuilder): void {
  b.tube(
    [
      [-0.07, 0.03, 0],
      [0.02, 0.03, 0],
    ],
    [0.022, 0.026],
    6,
    ch(C.wheatDark),
  );
  b.ellipsoid([0.05, 0.03, 0], [0.04, 0.034, 0.034], 6, 3, () => ch(C.wheat));
  b.ellipsoid([-0.02, 0.03, 0], [0.006, 0.03, 0.03], 6, 1, () => ch(C.rope));
}

function sack(b: RigBuilder, x: number, y: number, z: number, k = 1): void {
  b.ellipsoid([x, y + 0.035 * k, z], [0.045 * k, 0.04 * k, 0.035 * k], 6, 3, () => ch(C.sack));
  b.ellipsoid([x, y + 0.082 * k, z], [0.014 * k, 0.012 * k, 0.012 * k], 4, 2, () => ch(C.sackTie));
}

function basket(b: RigBuilder, fill: (b: RigBuilder) => void): void {
  b.ellipsoid([0, 0.03, 0], [0.06, 0.03, 0.045], 8, 2, () => ch(C.wicker), Math.PI / 8, Math.PI / 2, Math.PI);
  b.tube(
    [
      [0, 0.03, 0],
      [0, 0.04, 0],
    ],
    [0.062, 0.062],
    8,
    ch(0x8c6238),
  );
  fill(b);
}

function breadBundle(b: RigBuilder): void {
  basket(b, (bb) => {
    bb.ellipsoid([-0.02, 0.045, 0], [0.03, 0.018, 0.022], 6, 2, () => ch(C.bread));
    bb.ellipsoid([0.022, 0.048, 0.006], [0.026, 0.02, 0.02], 6, 2, () => ch(C.breadTop));
  });
}

function vegBundle(b: RigBuilder): void {
  basket(b, (bb) => {
    bb.ellipsoid([-0.02, 0.048, 0], [0.024, 0.022, 0.024], 6, 2, () => ch(C.cabbage));
    bb.ellipsoid([0.02, 0.046, 0.01], [0.016, 0.016, 0.016], 5, 2, () => ch(C.beet));
    bb.tube(
      [
        [0.01, 0.05, -0.02],
        [0.05, 0.06, -0.02],
      ],
      [0.008, 0],
      4,
      ch(C.carrot),
    );
  });
}

function fishBundle(b: RigBuilder): void {
  b.tube(
    [
      [-0.06, 0.09, 0],
      [0.06, 0.09, 0],
    ],
    [0.004, 0.004],
    3,
    ch(C.bark),
  );
  for (const x of [-0.03, 0.0, 0.03]) {
    b.ellipsoid([x, 0.045, 0], [0.012, 0.03, 0.008], 5, 3, (_nx, ny) => ch(ny < -0.3 ? C.fishBelly : C.fish));
    b.tri([x, 0.015, 0], [x - 0.012, 0.0, 0], [x + 0.012, 0.0, 0], ch(C.fish), [0, 0, 1]);
    b.tri([x, 0.015, 0], [x - 0.012, 0.0, 0], [x + 0.012, 0.0, 0], ch(C.fish), [0, 0, -1]);
  }
}

/**
 * A carried bundle for a good id, in figure space with its base at y 0, about 0.15 wide along x,
 * for the resident material. Unknown goods travel as a little crate.
 */
export function bundleGeometry(good: string): BufferGeometry {
  const b = new RigBuilder();
  switch (good) {
    case 'logs':
      logBundle(b);
      break;
    case 'planks':
      plankBundle(b);
      break;
    case 'stone':
      stoneBundle(b);
      break;
    case 'wheat':
      wheatBundle(b);
      break;
    case 'flour':
      sack(b, 0, 0, 0, 1.1);
      break;
    case 'bread':
      breadBundle(b);
      break;
    case 'vegetables':
      vegBundle(b);
      break;
    case 'fish':
      fishBundle(b);
      break;
    default:
      b.box(-0.045, 0, -0.035, 0.045, 0.06, 0.035, ch(C.crate));
  }
  return b.build(0.3);
}

// --- Stock piles in building geometry ------------------------------------------------------------

/**
 * Adds a stock pile of `good` at (x, z) (the pile's center on the ground at height y) to a kit.
 * `level` 1 to 4 grows the pile; 0 adds nothing. Footprint about 0.6 x 0.5, along x.
 */
export function pileOf(
  s: ShapeBuilder,
  good: string,
  level: number,
  x: number,
  y: number,
  z: number,
  rnd: () => number,
): void {
  if (level <= 0) return;
  const lv = Math.min(4, Math.round(level));
  switch (good) {
    case 'logs': {
      // A log stack between two posts, rows shrinking toward the top.
      const rows = lv === 1 ? 1 : lv === 2 ? 2 : 3;
      const r = 0.055;
      for (let row = 0; row < rows; row++) {
        const n = (lv >= 4 ? 5 : 4) - row;
        for (let i = 0; i < n; i++) {
          const zz = z + (i - (n - 1) / 2) * r * 2;
          const yy = y + r + row * r * 1.75;
          const log = vary(C.bark, rnd, 0.6);
          cylX(s, x - 0.28, x + 0.28, yy, zz, r, log, 6);
        }
      }
      for (const px of [-0.3, 0.3])
        s.box(x + px - 0.02, y, z - 0.05, x + px + 0.02, y + 0.12 + rows * 0.06, z + 0.05, palette.timber);
      break;
    }
    case 'planks': {
      s.box(x - 0.24, y, z - 0.2, x - 0.18, y + 0.04, z + 0.2, palette.darkWood);
      s.box(x + 0.18, y, z - 0.2, x + 0.24, y + 0.04, z + 0.2, palette.darkWood);
      const n = lv * 3;
      for (let i = 0; i < n; i++) {
        const yy = y + 0.04 + i * 0.026;
        const dx = (rnd() - 0.5) * 0.03;
        s.box(
          x - 0.3 + dx,
          yy,
          z - 0.16,
          x + 0.3 + dx,
          yy + 0.022,
          z + 0.16,
          vary(i % 2 ? C.plankDark : C.plank, rnd, 0.6),
        );
      }
      break;
    }
    case 'stone': {
      const blocks: [number, number, number][] = [
        [-0.14, 0, -0.08],
        [0.14, 0, -0.08],
        [0, 0, 0.12],
        [-0.14, 0, 0.12],
        [0.14, 0, 0.12],
        [-0.07, 1, -0.02],
        [0.08, 1, 0.02],
        [0, 2, 0],
      ];
      const count = [0, 2, 4, 6, 8][lv]!;
      for (let i = 0; i < count; i++) {
        const [bx, by, bz] = blocks[i]!;
        const h = 0.1;
        s.rbox(
          x + bx - 0.11,
          y + by * h,
          z + bz - 0.09,
          x + bx + 0.11,
          y + (by + 1) * h,
          z + bz + 0.09,
          vary(C.stone, rnd, 1.2),
          0.012,
        );
      }
      break;
    }
    case 'wheat': {
      // Stooks: sheaves leaning together.
      const n = lv;
      for (let i = 0; i < n; i++) {
        const sx = x + (i - (n - 1) / 2) * 0.16;
        s.cylinder(sx, z, 0.07, 0.02, y, y + 0.22, vary(C.wheatDark, rnd, 0.5), 6);
        s.cylinder(sx, z, 0.06, 0.0, y + 0.18, y + 0.3, vary(C.wheat, rnd, 0.5), 6);
      }
      break;
    }
    case 'flour': {
      const spots: [number, number, number][] = [
        [-0.12, 0, -0.06],
        [0.12, 0, -0.06],
        [0, 0, 0.1],
        [-0.12, 0, 0.1],
        [0.12, 0, 0.1],
        [0, 1, 0],
        [-0.1, 1, 0.05],
      ];
      const count = [0, 2, 3, 5, 7][lv]!;
      for (let i = 0; i < count; i++) {
        const [sx, sy, sz] = spots[i]!;
        sackPile(s, x + sx, y + sy * 0.11, z + sz, rnd);
      }
      break;
    }
    case 'bread':
    case 'vegetables':
    case 'fish': {
      const count = Math.min(4, lv);
      const spots: [number, number, number][] = [
        [-0.13, 0, -0.07],
        [0.13, 0, -0.07],
        [0, 0, 0.11],
        [0, 1, -0.02],
      ];
      for (let i = 0; i < count; i++) {
        const [cx, cy, cz] = spots[i]!;
        crateOf(s, good, x + cx, y + cy * 0.13, z + cz, rnd);
      }
      break;
    }
    default:
      for (let i = 0; i < lv; i++) crateOf(s, '', x + (i - (lv - 1) / 2) * 0.2, y, z, rnd);
  }
}

function sackPile(s: ShapeBuilder, x: number, y: number, z: number, rnd: () => number): void {
  s.blob(x, y + 0.055, z, 0.09, 0.06, 0.07, vary(C.sack, rnd, 0.5), 1);
  s.blob(x, y + 0.115, z, 0.025, 0.02, 0.025, C.sackTie, 0);
}

/** A slatted crate topped with its goods. */
export function crateOf(
  s: ShapeBuilder,
  good: string,
  x: number,
  y: number,
  z: number,
  rnd: () => number,
): void {
  const w = 0.11;
  const h = 0.12;
  s.rbox(x - w, y, z - 0.08, x + w, y + h, z + 0.08, vary(C.crate, rnd, 0.8), 0.01);
  s.box(x - w - 0.004, y + h * 0.45, z - 0.084, x + w + 0.004, y + h * 0.55, z + 0.084, palette.darkWood);
  const top = y + h;
  switch (good) {
    case 'bread':
      for (const dx of [-0.05, 0.05])
        s.blob(x + dx, top + 0.01, z, 0.05, 0.03, 0.035, vary(C.bread, rnd, 0.6), 1);
      break;
    case 'vegetables':
      s.blob(x - 0.05, top + 0.01, z - 0.02, 0.045, 0.04, 0.045, C.cabbage, 1);
      s.blob(x + 0.04, top + 0.005, z + 0.02, 0.03, 0.03, 0.03, C.beet, 0);
      s.blob(x + 0.05, top + 0.005, z - 0.03, 0.03, 0.025, 0.03, C.carrot, 0);
      break;
    case 'fish':
      for (const dz of [-0.04, 0, 0.04])
        s.blob(x, top + 0.008, z + dz, 0.08, 0.015, 0.02, vary(C.fish, rnd, 0.5), 0);
      break;
    case 'wheat':
      s.blob(x, top + 0.02, z, 0.09, 0.03, 0.06, C.wheat, 1);
      break;
    default:
      s.box(x - w + 0.01, top - 0.005, z - 0.07, x + w - 0.01, top, z + 0.07, palette.darkWood);
  }
}

/** Pile level 0 to 4 for a quantity, against what a full pile holds. */
export function pileLevel(qty: number, full: number): number {
  if (qty <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((qty / full) * 4)));
}

/** A two-wheeled handcart (I2 carts use it; I1 shows it beside yards). Faces +z, about one tile long. */
export const handcart: Kit = {
  id: 'handcart',
  kind: 'decor',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 21);
    const s = new ShapeBuilder();
    const wood = vary(palette.wood, rnd, 0.6);
    s.rbox(-0.16, 0.12, -0.22, 0.16, 0.16, 0.2, wood, 0.01);
    for (const x of [-0.16, 0.16]) s.box(x - 0.012, 0.16, -0.22, x + 0.012, 0.26, 0.2, vary(wood, rnd, 0.5));
    s.box(-0.16, 0.16, 0.188, 0.16, 0.24, 0.2, vary(wood, rnd, 0.5));
    s.box(-0.16, 0.16, -0.22, 0.16, 0.24, -0.208, vary(wood, rnd, 0.5));
    for (const x of [-0.2, 0.2]) {
      cylX(s, x - 0.02, x + 0.02, 0.11, 0.0, 0.11, palette.darkWood, 10);
      cylX(s, x - 0.024, x + 0.024, 0.11, 0.0, 0.025, palette.metal, 6);
    }
    for (const x of [-0.11, 0.11]) s.box(x - 0.012, 0.13, 0.2, x + 0.012, 0.15, 0.42, palette.timber);
    s.box(-0.12, 0.0, -0.2, -0.1, 0.12, -0.18, palette.timber);
    s.box(0.1, 0.0, -0.2, 0.12, 0.12, -0.18, palette.timber);
    return s.build();
  },
};
