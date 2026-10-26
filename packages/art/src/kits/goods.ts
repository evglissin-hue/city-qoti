// Goods on screen: bundles that porters carry, and stock piles for yards, building sites and stall
// counters. Bundles are figure-space pieces for the resident material (held in front of the chest);
// piles go into building geometry through the plain ShapeBuilder.
import type { BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary } from '../geometry';
import { palette } from '../palette';
import { RigBuilder, type Channel } from '../rig';
import { beam, cylX, cylZ } from '../shapes';
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
  // I2 goods (C4E).
  clay: 0xc27a4a,
  clayDark: 0xa25f38,
  brick: 0xb5654b,
  brickDark: 0x9a4f3a,
  wool: 0xf1ebdc,
  woolShade: 0xd9cfba,
  yarnA: 0xc75b52,
  yarnB: 0x5f8fb0,
  yarnC: 0xd6a73e,
  cloth: 0x7f9bb5,
  clothB: 0xc98a7e,
  milk: 0xf7f4ec,
  pail: 0xb9bdc0,
  cheese: 0xf0c75a,
  cheeseRind: 0xd9a53c,
  apple: 0xc7432f,
  appleGreen: 0x9cbf4a,
  cider: 0x9a6b43,
  jug: 0xb98a5a,
  herb: 0x6f9a4a,
  lavender: 0x9f86c8,
  chamomile: 0xf3ecc8,
  iron: 0x5c6168,
  handle: 0x9a6b43,
} as const;

const C = GOOD_COLORS;
const ch = (hex: number): Channel => ({ hex });

/** Ids of goods with their own bundle; anything else is carried as a little crate. */
export const BUNDLE_GOODS = [
  'apples',
  'bread',
  'bricks',
  'cheese',
  'cider',
  'clay',
  'cloth',
  'firewood',
  'fish',
  'flour',
  'herbs',
  'logs',
  'milk',
  'planks',
  'stone',
  'tools',
  'vegetables',
  'wheat',
  'wool',
  'yarn',
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
  b.ellipsoid([0, 0.036, 0], [0.006, 0.036, 0.04], 6, 2, () => ch(C.rope));
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
      [-0.07, 0.036, 0],
      [0.02, 0.036, 0],
    ],
    [0.022, 0.026],
    6,
    ch(C.wheatDark),
  );
  b.ellipsoid([0.05, 0.036, 0], [0.04, 0.034, 0.034], 6, 3, () => ch(C.wheat));
  b.ellipsoid([-0.02, 0.036, 0], [0.006, 0.03, 0.03], 6, 1, () => ch(C.rope));
}

function sack(b: RigBuilder, x: number, y: number, z: number, k = 1): void {
  b.ellipsoid([x, y + 0.04 * k, z], [0.045 * k, 0.04 * k, 0.035 * k], 6, 3, () => ch(C.sack));
  b.ellipsoid([x, y + 0.087 * k, z], [0.014 * k, 0.012 * k, 0.012 * k], 4, 2, () => ch(C.sackTie));
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

// --- I2 bundles (C4E) ---------------------------------------------------------------------------

function clayBundle(b: RigBuilder): void {
  // A wet block of clay wrapped in a damp cloth, slumping a little.
  b.ellipsoid([0, 0.032, 0], [0.05, 0.032, 0.038], 7, 3, (_x, ny) => ch(ny > 0.5 ? C.clay : C.clayDark));
  b.box(-0.052, 0.018, -0.006, 0.052, 0.03, 0.006, ch(C.sack));
}

function brickBundle(b: RigBuilder): void {
  // A brick hod: three bricks on a little wooden tray.
  b.box(-0.06, 0, -0.03, 0.06, 0.008, 0.03, ch(C.plankDark));
  for (let i = 0; i < 3; i++) {
    const y = 0.008 + i * 0.022;
    const dx = (i % 2) * 0.01 - 0.005;
    b.box(-0.05 + dx, y, -0.024, 0.05 + dx, y + 0.02, 0.024, ch(i % 2 ? C.brickDark : C.brick));
  }
}

function woolBundle(b: RigBuilder): void {
  // A rolled fleece, fluffy and lumpy, tied with twine.
  for (const [x, y, k] of [
    [-0.03, 0.04, 1],
    [0.03, 0.042, 0.95],
    [0, 0.07, 0.8],
  ] as const)
    b.ellipsoid([x, y, 0], [0.04 * k, 0.036 * k, 0.04 * k], 6, 3, (_x, ny) =>
      ch(ny > 0 ? C.wool : C.woolShade),
    );
  b.ellipsoid([0, 0.045, 0], [0.006, 0.04, 0.044], 6, 1, () => ch(C.sackTie));
}

function yarnBundle(b: RigBuilder): void {
  basket(b, (bb) => {
    bb.ellipsoid([-0.024, 0.05, 0], [0.022, 0.022, 0.022], 6, 3, () => ch(C.yarnA));
    bb.ellipsoid([0.02, 0.05, 0.01], [0.02, 0.02, 0.02], 6, 3, () => ch(C.yarnB));
    bb.ellipsoid([0.006, 0.058, -0.02], [0.017, 0.017, 0.017], 6, 3, () => ch(C.yarnC));
  });
}

function clothBundle(b: RigBuilder): void {
  // A bolt of cloth on the shoulder: a long roll with a lighter folded edge.
  b.tube(
    [
      [-0.075, 0.03, 0],
      [0.075, 0.03, 0],
    ],
    [0.03, 0.03],
    8,
    ch(C.cloth),
  );
  for (const x of [-0.075, 0.075]) b.ellipsoid([x, 0.03, 0], [0.003, 0.028, 0.028], 8, 1, () => ch(C.clothB));
}

function milkBundle(b: RigBuilder): void {
  // A pail of milk with a bail handle.
  b.tube(
    [
      [0, 0, 0],
      [0, 0.07, 0],
    ],
    [0.034, 0.042],
    8,
    ch(C.pail),
  );
  b.ellipsoid([0, 0.066, 0], [0.038, 0.004, 0.038], 8, 1, () => ch(C.milk));
  b.tube(
    [
      [-0.04, 0.07, 0],
      [0, 0.105, 0],
      [0.04, 0.07, 0],
    ],
    [0.003, 0.003, 0.003],
    3,
    ch(0x6f7479),
  );
}

function cheeseBundle(b: RigBuilder): void {
  // Two cheese wheels stacked, one cut.
  b.tube(
    [
      [0, 0, 0],
      [0, 0.04, 0],
    ],
    [0.05, 0.05],
    10,
    ch(C.cheeseRind),
  );
  b.ellipsoid([0, 0.04, 0], [0.05, 0.004, 0.05], 10, 1, () => ch(C.cheese));
  b.tube(
    [
      [0.005, 0.044, 0],
      [0.005, 0.074, 0],
    ],
    [0.036, 0.036],
    8,
    ch(C.cheeseRind),
  );
  b.ellipsoid([0.005, 0.074, 0], [0.036, 0.003, 0.036], 8, 1, () => ch(C.cheese));
}

function appleBundle(b: RigBuilder): void {
  basket(b, (bb) => {
    for (const [x, z, c] of [
      [-0.028, -0.01, C.apple],
      [0.012, 0.012, C.apple],
      [0.03, -0.016, C.appleGreen],
      [-0.006, -0.022, C.apple],
      [0.0, 0.0, C.apple],
    ] as const) {
      bb.nub([x, 0.05 + (x === 0 ? 0.012 : 0), z], [0.016, 0.015, 0.016], ch(c));
    }
  });
}

function ciderBundle(b: RigBuilder): void {
  // A little cask on the shoulder, hoops and all.
  b.tube(
    [
      [-0.055, 0.04, 0],
      [0, 0.04, 0],
      [0.055, 0.04, 0],
    ],
    [0.03, 0.037, 0.03],
    8,
    ch(C.cider),
  );
  for (const x of [-0.035, 0.035])
    b.tube(
      [
        [x - 0.004, 0.04, 0],
        [x + 0.004, 0.04, 0],
      ],
      [0.036, 0.036],
      8,
      ch(0x55595e),
    );
}

function firewoodBundle(b: RigBuilder): void {
  // An armful of split wood: wedges with pale split faces.
  for (const [y, z, r] of [
    [0.018, -0.02, 0.018],
    [0.018, 0.018, 0.017],
    [0.045, 0, 0.018],
    [0.045, -0.034, 0.014],
  ] as const) {
    b.tube(
      [
        [-0.065, y, z],
        [0.065, y, z],
      ],
      [r, r],
      3,
      ch(C.bark),
    );
    for (const x of [-0.065, 0.065])
      b.ellipsoid([x, y, z], [0.002, r * 0.9, r * 0.9], 3, 1, () => ch(C.logEnd));
  }
}

function herbBundle(b: RigBuilder): void {
  // Bunches tied at the stems, heads of sage, lavender and chamomile.
  b.tube(
    [
      [-0.06, 0.03, 0],
      [0.0, 0.03, 0],
    ],
    [0.008, 0.012],
    4,
    ch(0x5c7f3a),
  );
  b.ellipsoid([0.03, 0.034, -0.012], [0.04, 0.022, 0.02], 6, 2, () => ch(C.herb));
  b.ellipsoid([0.035, 0.045, 0.012], [0.035, 0.014, 0.012], 5, 2, () => ch(C.lavender));
  b.ellipsoid([0.03, 0.02, 0.016], [0.022, 0.012, 0.012], 5, 2, () => ch(C.chamomile));
  b.ellipsoid([-0.024, 0.03, 0], [0.004, 0.012, 0.012], 4, 1, () => ch(C.rope));
}

function toolsBundle(b: RigBuilder): void {
  // A wooden tool tray with a hammer and a saw handle poking out.
  b.box(-0.06, 0, -0.03, 0.06, 0.035, 0.03, ch(C.crate));
  b.box(-0.004, 0.035, -0.003, 0.004, 0.08, 0.003, ch(C.plankDark));
  b.tube(
    [
      [-0.04, 0.045, -0.012],
      [0.03, 0.06, -0.012],
    ],
    [0.005, 0.005],
    4,
    ch(C.handle),
  );
  b.box(0.025, 0.05, -0.022, 0.045, 0.074, -0.002, ch(C.iron));
  b.box(-0.05, 0.035, 0.008, 0.02, 0.06, 0.012, ch(0xa8adb3));
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
    case 'clay':
      clayBundle(b);
      break;
    case 'bricks':
      brickBundle(b);
      break;
    case 'wool':
      woolBundle(b);
      break;
    case 'yarn':
      yarnBundle(b);
      break;
    case 'cloth':
      clothBundle(b);
      break;
    case 'milk':
      milkBundle(b);
      break;
    case 'cheese':
      cheeseBundle(b);
      break;
    case 'apples':
      appleBundle(b);
      break;
    case 'cider':
      ciderBundle(b);
      break;
    case 'firewood':
      firewoodBundle(b);
      break;
    case 'herbs':
      herbBundle(b);
      break;
    case 'tools':
      toolsBundle(b);
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
      if (villagePile(s, good, lv, x, y, z, rnd)) break;
      for (let i = 0; i < lv; i++) crateOf(s, '', x + (i - (lv - 1) / 2) * 0.2, y, z, rnd);
  }
}

/** Spots for up to eight small items in a pile about 0.6 x 0.45: a bottom row, then on top. */
const SPOTS: [number, number, number][] = [
  [-0.17, 0, -0.08],
  [0.0, 0, -0.08],
  [0.17, 0, -0.08],
  [-0.09, 0, 0.1],
  [0.09, 0, 0.1],
  [-0.08, 1, -0.02],
  [0.08, 1, 0.0],
  [0.0, 2, -0.01],
];

/** A cheese wheel (or a cut one) lying flat. */
export function cheeseWheel(
  s: ShapeBuilder,
  x: number,
  y: number,
  z: number,
  r: number,
  rnd: () => number,
): void {
  s.cylinder(x, z, r, r, y, y + r * 0.75, vary(C.cheeseRind, rnd, 0.6), 10);
  s.cylinder(x, z, r * 0.94, r * 0.94, y + r * 0.75, y + r * 0.78, vary(C.cheese, rnd, 0.4), 10);
}

/** A wound skein of yarn, hanging or lying, about 0.1 long. */
export function skein(
  s: ShapeBuilder,
  x: number,
  y: number,
  z: number,
  hex: number,
  rnd: () => number,
): void {
  s.blob(x, y, z, 0.045, 0.03, 0.03, vary(hex, rnd, 0.5), 1);
  s.blob(x, y, z, 0.012, 0.032, 0.032, vary(hex, rnd, 1.6), 0);
}

const YARNS = [C.yarnA, C.yarnB, C.yarnC, C.wool, 0x8fa37a];
const CLOTHS = [C.cloth, C.clothB, 0x8fa37a, 0xd6c49a, 0x9f8fc4];

/** I2 goods (C4E): piles for clay, bricks, wool, yarn, cloth, milk, cheese, apples, cider, firewood, herbs, tools. */
function villagePile(
  s: ShapeBuilder,
  good: string,
  lv: number,
  x: number,
  y: number,
  z: number,
  rnd: () => number,
): boolean {
  const count = [0, 2, 4, 6, 8][lv]!;
  switch (good) {
    case 'clay': {
      // A heap of dug clay with a few cut blocks drying beside it.
      s.blob(
        x - 0.06,
        y,
        z,
        0.2 + lv * 0.03,
        0.06 + lv * 0.03,
        0.17,
        vary(C.clay, rnd, 0.6),
        1,
        rnd,
        0.12,
        C.clay,
      );
      for (let i = 0; i < Math.min(4, lv); i++)
        s.rbox(
          x + 0.14,
          y + i * 0.05,
          z - 0.14 + (i % 2) * 0.12,
          x + 0.26,
          y + 0.05 + i * 0.05,
          z - 0.04 + (i % 2) * 0.12,
          vary(C.clayDark, rnd, 0.6),
          0.008,
        );
      return true;
    }
    case 'bricks': {
      // Hacks of bricks on a pallet, stacked crosswise.
      s.box(x - 0.26, y, z - 0.18, x + 0.26, y + 0.04, z + 0.18, palette.darkWood);
      const layers = lv * 2;
      for (let l = 0; l < layers; l++) {
        const yy = y + 0.04 + l * 0.034;
        const along = l % 2 === 0;
        for (let i = 0; i < 4; i++) {
          const o = -0.18 + i * 0.12;
          const hex = vary(i % 2 ? C.brick : C.brickDark, rnd, 0.8);
          if (along) s.box(x - 0.22, yy, z + o - 0.05, x + 0.22, yy + 0.03, z + o + 0.05, hex);
          else s.box(x + o - 0.05, yy, z - 0.15, x + o + 0.05, yy + 0.03, z + 0.15, hex);
        }
      }
      return true;
    }
    case 'wool': {
      // Woolsacks: tall, soft and tied at the top.
      for (let i = 0; i < count; i++) {
        const [sx, sy, sz] = SPOTS[i]!;
        s.blob(
          x + sx,
          y + sy * 0.13 + 0.07,
          z + sz,
          0.085,
          0.08,
          0.08,
          vary(i % 3 ? C.wool : C.woolShade, rnd, 0.4),
          1,
          rnd,
          0.08,
        );
      }
      return true;
    }
    case 'yarn': {
      for (let i = 0; i < count; i++) {
        const [sx, sy, sz] = SPOTS[i]!;
        skein(s, x + sx, y + 0.03 + sy * 0.06, z + sz, YARNS[i % YARNS.length]!, rnd);
      }
      return true;
    }
    case 'cloth': {
      // Bolts of cloth on a low trestle, each its own color.
      s.box(x - 0.26, y, z - 0.16, x + 0.26, y + 0.1, z + 0.16, vary(palette.wood, rnd, 0.5));
      for (let i = 0; i < Math.min(6, lv + 2); i++) {
        const row = Math.floor(i / 3);
        const zz = z - 0.1 + (i % 3) * 0.1;
        cylX(
          s,
          x - 0.22,
          x + 0.22,
          y + 0.14 + row * 0.08,
          zz,
          0.042,
          vary(CLOTHS[i % CLOTHS.length]!, rnd, 0.4),
          8,
        );
      }
      return true;
    }
    case 'milk': {
      for (let i = 0; i < Math.min(6, count); i++) {
        const [sx, , sz] = SPOTS[i]!;
        s.cylinder(x + sx, z + sz, 0.05, 0.05, y, y + 0.13, 0xb9bdc0, 8);
        s.cylinder(x + sx, z + sz, 0.05, 0.028, y + 0.13, y + 0.16, 0xb9bdc0, 8);
        s.cylinder(x + sx, z + sz, 0.032, 0.032, y + 0.16, y + 0.18, 0x8d9296, 8);
      }
      return true;
    }
    case 'cheese': {
      // A cheese board on trestles with wheels stacked in towers.
      s.box(x - 0.26, y + 0.08, z - 0.14, x + 0.26, y + 0.1, z + 0.14, vary(palette.wood, rnd, 0.5));
      for (const dx of [-0.22, 0.22])
        s.box(x + dx - 0.02, y, z - 0.12, x + dx + 0.02, y + 0.08, z + 0.12, palette.timber);
      for (let i = 0; i < count; i++) {
        const col = i % 4;
        const h = Math.floor(i / 4);
        cheeseWheel(s, x - 0.18 + col * 0.12, y + 0.1 + h * 0.06, z + (col % 2) * 0.05 - 0.02, 0.06, rnd);
      }
      return true;
    }
    case 'apples': {
      for (let i = 0; i < Math.min(5, count); i++) {
        const [cx, cy, cz] = SPOTS[i]!;
        crateOf(s, 'apples', x + cx * 0.75, y + cy * 0.13, z + cz, rnd);
      }
      return true;
    }
    case 'cider': {
      // Casks on a rack, lying down, with one standing on end.
      s.box(x - 0.27, y, z - 0.15, x + 0.27, y + 0.03, z + 0.15, palette.darkWood);
      const n = Math.min(6, lv + 2);
      for (let i = 0; i < n; i++) {
        const row = i < 3 ? 0 : 1;
        const xx = x - 0.16 + (i % 3) * 0.16 + row * 0.08;
        if (row === 1 && i % 3 === 2) continue;
        cylZ(
          s,
          z - 0.12,
          z + 0.12,
          xx,
          y + 0.1 + row * 0.15,
          0.075,
          vary(C.cider, rnd, 0.6),
          8,
          vary(0xb98a5a, rnd, 0.4),
        );
        for (const dz of [-0.07, 0.07])
          cylZ(s, z + dz - 0.008, z + dz + 0.008, xx, y + 0.1 + row * 0.15, 0.078, 0x55595e, 8);
      }
      return true;
    }
    case 'firewood': {
      // A neat woodstack between end posts, rising with the pile.
      const rows = lv + 1;
      for (let row = 0; row < rows; row++) {
        for (let i = 0; i < 7; i++) {
          const zz = z - 0.18 + i * 0.06 + (row % 2) * 0.03;
          const yy = y + 0.03 + row * 0.052;
          cylX(s, x - 0.22, x + 0.22, yy, zz, 0.03, vary(C.bark, rnd, 0.8), 3, vary(C.logEnd, rnd, 0.6));
        }
      }
      for (const dx of [-0.24, 0.24])
        s.box(x + dx - 0.015, y, z - 0.22, x + dx + 0.015, y + 0.06 + rows * 0.055, z - 0.19, palette.timber);
      return true;
    }
    case 'herbs': {
      // Baskets of cut herbs: sage, lavender and chamomile.
      const tops = [C.herb, C.lavender, C.chamomile, 0x7fae4e];
      for (let i = 0; i < Math.min(5, count); i++) {
        const [bx, , bz] = SPOTS[i]!;
        s.cylinder(x + bx, z + bz, 0.07, 0.08, y, y + 0.07, vary(C.wicker, rnd, 0.5), 8);
        s.blob(
          x + bx,
          y + 0.08,
          z + bz,
          0.07,
          0.04,
          0.07,
          vary(tops[i % tops.length]!, rnd, 0.6),
          1,
          rnd,
          0.15,
        );
      }
      return true;
    }
    case 'tools': {
      for (let i = 0; i < Math.min(5, count); i++) {
        const [cx, cy, cz] = SPOTS[i]!;
        crateOf(s, 'tools', x + cx * 0.75, y + cy * 0.13, z + cz, rnd);
      }
      return true;
    }
  }
  return false;
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
    case 'apples':
      for (const [dx, dz, hex] of [
        [-0.06, -0.03, C.apple],
        [0.0, 0.02, C.apple],
        [0.06, -0.02, C.appleGreen],
        [-0.03, 0.035, C.apple],
        [0.05, 0.04, C.apple],
      ] as const)
        s.blob(x + dx, top + 0.012, z + dz, 0.03, 0.028, 0.03, vary(hex, rnd, 0.5), 0);
      break;
    case 'cheese':
      cheeseWheel(s, x - 0.045, top - 0.005, z, 0.05, rnd);
      cheeseWheel(s, x + 0.055, top - 0.005, z + 0.01, 0.045, rnd);
      break;
    case 'herbs':
      s.blob(x - 0.04, top + 0.01, z, 0.06, 0.03, 0.05, vary(C.herb, rnd, 0.5), 1);
      s.blob(x + 0.05, top + 0.01, z, 0.05, 0.025, 0.045, vary(C.lavender, rnd, 0.5), 1);
      break;
    case 'yarn':
      skein(s, x - 0.05, top + 0.01, z, C.yarnA, rnd);
      skein(s, x + 0.05, top + 0.01, z, C.yarnB, rnd);
      break;
    case 'tools':
      beam(s, [x - 0.08, top + 0.01, z - 0.03], [x + 0.08, top + 0.02, z - 0.03], 0.008, C.handle);
      s.box(x + 0.06, top, z - 0.05, x + 0.09, top + 0.035, z - 0.01, C.iron);
      beam(s, [x - 0.07, top + 0.012, z + 0.03], [x + 0.07, top + 0.012, z + 0.04], 0.007, C.handle);
      s.box(x - 0.09, top, z + 0.015, x - 0.05, top + 0.02, z + 0.055, 0xa8adb3);
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
