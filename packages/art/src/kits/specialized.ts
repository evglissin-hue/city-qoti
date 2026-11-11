// R1E: the specialized buildings the zones-first economy keeps (docs/build/cycle-r1e-trade-art.md,
// "The four new kits"): the Brickworks, the Granary and the Market Square (the Forester's Lodge is
// `forester` in workplaces.ts). Each has one signature mass outside `s.detail` so the far level
// reads (the bottle kiln and its smoke, the granary's tall body on its stones, six colored
// canopies); the small things are near-only. Runtime piles follow `stock:<good>`, `out:<good>` and
// `in:<good>` levels 0 to 4.
import { vary, type V3 } from '../geometry';
import type { ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import { beam, panel } from '../shapes';
import { shell, signBoard, windowRow, windowStyle, type Built } from './buildings';
import { cheeseWheel, crateOf, GOOD_COLORS, pileOf } from './goods';
import { doorPart, faceBox, facePoint, kitBuilder, type Face } from './parts';
import { barrel, groundPatch } from './props';
import { roofPart } from './roofs';
import { customOf, level, roofColor, streams } from './style';
import type { KitBuildOptions } from './types';
import { postAndRail } from './details';
import { bottleKiln, pugMill, spade, villageKit, wheelbarrow } from './village';

const CLAY = GOOD_COLORS.clay;
const CLAY_DARK = GOOD_COLORS.clayDark;

function start(opts?: KitBuildOptions): Built {
  return { s: kitBuilder(opts), anchors: { smoke: [], lights: [] } };
}

/** A tiny lit lamp (a glowing pane in a frame) at a point; returns the flame position. */
function lamp(s: ShapeBuilder, x: number, y: number, z: number): V3 {
  s.box(x - 0.035, y - 0.02, z - 0.035, x + 0.035, y, z + 0.035, palette.metal);
  s.glow(2);
  s.box(x - 0.028, y, z - 0.028, x + 0.028, y + 0.07, z + 0.028, palette.lantern);
  s.glow(0);
  s.box(x - 0.04, y + 0.07, z - 0.04, x + 0.04, y + 0.085, z + 0.04, palette.metal);
  return [x, y + 0.035, z];
}

// --- Brickworks ---------------------------------------------------------------------------------

/** A pallet of fired red bricks stacked in courses, the courses crossed. */
function brickStack(s: ShapeBuilder, x: number, z: number, rows: number, rnd: () => number): void {
  s.levels(
    () => {
      s.box(x - 0.19, 0, z - 0.14, x + 0.19, 0.03, z + 0.14, vary(palette.wood, rnd, 0.5));
      for (let r = 0; r < rows; r++) {
        const y = 0.03 + r * 0.052;
        const along = r % 2 === 0;
        const hx = along ? 0.17 : 0.12;
        const hz = along ? 0.1 : 0.13;
        s.box(x - hx, y, z - hz, x + hx, y + 0.05, z + hz, vary(palette.brick, rnd, 0.5));
        s.box(
          x - hx - 0.004,
          y + 0.044,
          z - hz - 0.004,
          x + hx + 0.004,
          y + 0.05,
          z + hz + 0.004,
          GOOD_COLORS.brickDark,
        );
      }
    },
    () => s.box(x - 0.17, 0, z - 0.13, x + 0.17, 0.03 + rows * 0.052, z + 0.13, palette.brick),
  );
}

/** A low drying hack: posts under a narrow roof sheltering rows of grey-green unfired bricks. */
function dryingHack(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  c: ReturnType<typeof customOf>,
  rnd: () => number,
): void {
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const)
    beam(s, [x, 0, z], [x, 0.4, z], 0.018, palette.timber);
  roofPart(s, {
    shape: 'gable',
    material: c.roofMaterial ?? 'shingle',
    x0: x0 - 0.1,
    z0: z0 - 0.1,
    x1: x1 + 0.1,
    z1: z1 + 0.1,
    y0: 0.38,
    y1: 0.58,
    color: vary(roofColor(c, c.roofMaterial ?? 'shingle', 0x8a6a4e), rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  s.detail(() => {
    for (const z of [z0 + 0.14, z1 - 0.14]) {
      s.box(x0 + 0.04, 0.1, z - 0.07, x1 - 0.04, 0.115, z + 0.07, vary(palette.wood, rnd, 0.5));
      const n = Math.floor((x1 - x0 - 0.1) / 0.085);
      for (let i = 0; i < n; i++) {
        const x = x0 + 0.08 + i * 0.085;
        for (let l = 0; l < 2; l++)
          s.box(
            x - 0.03,
            0.115 + l * 0.04,
            z - 0.055,
            x + 0.03,
            0.15 + l * 0.04,
            z + 0.055,
            vary(0x9aa078, rnd, 0.6),
          );
      }
    }
  });
}

function brickworks(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const { rnd } = streams(opts, 61);
  const c = customOf(opts);
  const { s, anchors } = start(opts);
  groundPatch(s, 0.08, 0.08, w - 0.08, d - 0.08, vary(0xa89276, rnd, 0.4), rnd);
  // The kiln: the tallest mass, in the back left corner, smoking.
  const kx = 0.85;
  const kz = 0.9;
  s.levels(
    () => anchors.smoke!.push(bottleKiln(s, kx, kz, rnd, anchors.lights!)),
    () => {
      // Far off: the bottle as four plain rings, still the tallest thing on the lot.
      for (const [r0, r1, y0, y1] of [
        [0.62, 0.5, 0, 0.8],
        [0.5, 0.32, 0.8, 1.15],
        [0.32, 0.19, 1.15, 1.38],
        [0.19, 0.16, 1.38, 1.8],
      ] as const)
        s.cylinder(kx, kz, r0, r1, y0, y1, palette.brick, 8);
    },
  );
  // The clay pit, dug into the back right corner: ochre banks with turf on top and a wet floor.
  const px0 = 1.75;
  const pz0 = 0.15;
  const px1 = w - 0.15;
  const pz1 = 1.05;
  s.rbox(px0 + 0.25, 0, pz0 + 0.25, px1 - 0.25, 0.014, pz1, vary(0x9a5532, rnd, 0.4), 0.05);
  s.blob((px0 + px1) / 2, 0.016, (pz0 + pz1) / 2 + 0.1, 0.3, 0.006, 0.17, 0x6f8f8a, 0);
  const bank = (x0: number, z0: number, x1: number, z1: number, h: number): void => {
    s.rbox(x0, 0, z0, x1, h, z1, vary(CLAY, rnd, 0.5), 0.03);
    s.rbox(x0 - 0.01, h - 0.035, z0 - 0.01, x1 + 0.01, h + 0.02, z1 + 0.01, vary(0x7f8a4a, rnd, 0.6), 0.02);
    s.box(x0 - 0.004, 0.03, z0 - 0.004, x1 + 0.004, 0.07, z1 + 0.004, vary(CLAY_DARK, rnd, 0.4));
  };
  bank(px0, pz0, px1, pz0 + 0.3, 0.42);
  bank(px0, pz0 + 0.3, px0 + 0.26, pz1, 0.3);
  bank(px1 - 0.26, pz0 + 0.3, px1, pz1 - 0.15, 0.24);
  // Drying hacks: one by the pit, one in front of the kiln.
  dryingHack(s, px0 + 0.05, 1.5, px1 - 0.05, 2.05, c, rnd);
  dryingHack(s, 0.25, 2.3, 1.2, 2.85, c, rnd);
  // Fired bricks stacked at the front by the output, more of them as it fills.
  const outLv = Math.max(0, Math.min(4, level(opts, 'out:brick') + level(opts, 'out:bricks')));
  const spots: [number, number][] = [
    [2.62, 2.7],
    [2.2, 2.7],
    [2.62, 2.35],
    [2.2, 2.35],
  ];
  const stacks = Math.min(4, 1 + outLv);
  for (let i = 0; i < stacks; i++) brickStack(s, spots[i]![0], spots[i]![1], 4 + (i % 3), rnd);
  s.detail(() => {
    pugMill(s, 1.8, 1.25, rnd, CLAY_DARK);
    wheelbarrow(s, 1.5, 2.3, CLAY, rnd);
    spade(s, px0 + 0.4, pz1 - 0.1, 0.06);
    // Kiln wood, stacked by the firing mouth.
    pileOf(s, 'firewood', Math.max(1, level(opts, 'in:firewood')), 0.55, 0, 1.85, rnd);
    // Spade marks in the fresh cut of the back bank.
    for (let i = 0; i < 5; i++) {
      const x = px0 + 0.1 + i * 0.2;
      s.box(x - 0.025, 0.2, pz0 + 0.3, x + 0.025, 0.34, pz0 + 0.335, vary(CLAY_DARK, rnd, 0.6));
    }
  });
  if (c.sign) signBoard(s, { dir: 'z+', plane: 2.95 }, 1.5, 0.42, 0.4, 0.02, anchors);
  return { s, anchors };
}

// --- Granary ------------------------------------------------------------------------------------

/** A mushroom-shaped staddle stone: a stem under a wide flat cap. */
function staddle(s: ShapeBuilder, x: number, z: number, h: number, rnd: () => number): void {
  s.cylinder(x, z, 0.09, 0.065, 0, h - 0.07, vary(palette.stone, rnd, 0.6), 8);
  s.cylinder(x, z, 0.16, 0.12, h - 0.07, h, vary(palette.stone, rnd, 0.4), 8);
}

/** Sacks in a little pyramid, one to four high. */
function sacks(s: ShapeBuilder, x: number, y: number, z: number, lv: number, rnd: () => number): void {
  const at: [number, number, number][] = [
    [-0.075, 0, 0],
    [0.075, 0, 0],
    [0, 0.1, 0],
    [0, 0.0, 0.14],
    [0.0, 0.1, 0.14],
  ];
  for (let i = 0; i < Math.min(5, 1 + lv); i++) {
    const [dx, dy, dz] = at[i]!;
    s.blob(x + dx, y + 0.055 + dy, z + dz, 0.075, 0.06, 0.07, vary(GOOD_COLORS.sack, rnd, 0.5), 1);
    s.blob(x + dx, y + 0.115 + dy, z + dz, 0.022, 0.02, 0.022, GOOD_COLORS.sackTie, 0);
  }
}

const LIFT = 0.34;

function granary(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, 2];
  const { rnd } = streams(opts, 62);
  const c = customOf(opts);
  const { s, anchors } = start(opts);
  const x0 = 0.75;
  const x1 = w - 0.75;
  const z0 = 0.3;
  const z1 = 1.8;
  const doorU = ex + 0.5;
  const material = c.roofMaterial ?? 'tile';
  // The body is drawn at ground level, then lifted onto its stones below.
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.04,
    wallH: 1.3,
    wall: 'weatherboard',
    wallColor: c.wall ?? vary(0x8f8576, rnd, 0.4),
    trim: palette.timber,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material, 0xa4552f), rnd, 0.4),
      rise: 1.1,
      overhang: 0.16,
      ridgeAlongX: false,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  doorPart(s, front, doorU, 0.5, 0.62, c.accent ?? vary(0x6e8a5a, rnd, 0.4), palette.white, 'double', 0.015);
  // The hoist loft: an upper hatch under the gable, a beam running out of the peak, a rope and a sack.
  faceBox(s, front, doorU - 0.19, 0.98, 0.004, doorU + 0.19, 1.42, 0.03, palette.timber);
  faceBox(s, front, doorU - 0.15, 1.0, 0.03, doorU + 0.15, 1.38, 0.045, vary(0x6b4a30, rnd, 0.4));
  const peak = sh.ridge - 0.12;
  beam(
    s,
    facePoint(front, doorU, peak, 0.0),
    facePoint(front, doorU, peak + 0.01, 0.5),
    0.03,
    palette.timber,
  );
  beam(s, facePoint(front, doorU, peak + 0.01, 0.47), facePoint(front, doorU, 0.62, 0.47), 0.005, 0xbfa27a);
  s.blob(doorU, 0.58, z1 + 0.47, 0.07, 0.06, 0.06, GOOD_COLORS.sack, 1);
  const style = windowStyle(c, palette.white, { box: false, shutters: true });
  for (const [f, u0, u1] of [
    [{ dir: 'x+', plane: x1 } as Face, z0, z1],
    [{ dir: 'x-', plane: x0 } as Face, z0, z1],
  ] as const)
    windowRow(s, f, u0, u1, 0.8, style, rnd, anchors.lights!, [], 0.9, [0.14, 0.18], 0.02);
  // The loading platform, its steps and a hand rail, all above ground level once lifted.
  s.rbox(x0 + 0.05, -LIFT, z1, x1 + 0.1, 0.04, z1 + 0.56, vary(palette.wood, rnd, 0.5), 0.01);
  for (const [i, h] of [
    [0, -0.21],
    [1, -0.08],
  ] as const)
    s.rbox(
      doorU - 0.22,
      -LIFT,
      z1 + 0.56 + i * 0.16,
      doorU + 0.22,
      h,
      z1 + 0.72 + i * 0.16,
      vary(palette.wood, rnd, 0.5),
      0.01,
    );
  s.detail(() => {
    // The stock: sacks of grain by the door and crates of the rest along the platform.
    const lv = (g: string): number => Math.max(0, Math.min(4, level(opts, `stock:${g}`)));
    const grain = Math.max(lv('grain'), 1);
    sacks(s, x0 + 0.2, 0.04, z1 + 0.14, grain, rnd);
    const slots: [string, number, number][] = [
      ['vegetables', x0 + 0.46, z1 + 0.14],
      ['fruit', x1 - 0.42, z1 + 0.14],
      ['cheese', x1 - 0.14, z1 + 0.14],
      ['fish', x0 + 0.3, z1 + 0.42],
      ['bread', x1 - 0.3, z1 + 0.42],
    ];
    for (const [g, x, z] of slots) {
      const n = lv(g);
      if (n > 0) crateOf(s, g, x, 0.04, z, rnd);
      if (n > 2) crateOf(s, g, x, 0.16, z, rnd);
    }
    barrel(s, x0 + 0.1, 0.04, z1 + 0.43, rnd, 0.9);
    barrel(s, x1 + 0.0, 0.04, z1 + 0.43, rnd, 0.9);
    // A lantern by the door.
    anchors.lights!.push(lamp(s, doorU + 0.36, 0.78, z1 + 0.04));
  });
  s.translate(0, LIFT, 0);
  for (const l of anchors.lights!) l[1] += LIFT;
  groundPatch(s, 0.08, 0.08, w - 0.08, d - 0.08, vary(0xa8946e, rnd, 0.4), rnd);
  // Staddle stones under the corners and the middle of each long side.
  s.levels(
    () => {
      for (const x of [x0 + 0.1, x1 - 0.1])
        for (const z of [z0 + 0.1, (z0 + z1) / 2, z1 - 0.1]) staddle(s, x, z, LIFT, rnd);
    },
    // Far off: a dark gap and four stone stubs read as a body standing on stones.
    () => {
      for (const x of [x0 + 0.1, x1 - 0.1])
        for (const z of [z0 + 0.1, z1 - 0.1])
          s.box(x - 0.1, 0, z - 0.1, x + 0.1, LIFT, z + 0.1, palette.stone);
    },
  );
  s.detail(() => {
    // Mid-span stones and a yard fence either side.
    staddle(s, (x0 + x1) / 2, z0 + 0.1, LIFT, rnd);
    postAndRail(s, [0.18, 0.3], [0.18, d - 0.2], rnd);
    postAndRail(s, [w - 0.18, 0.3], [w - 0.18, d - 0.2], rnd);
    sacks(s, 0.5, 0, 2.55, 2, rnd);
  });
  if (c.sign) signBoard(s, { dir: 'z+', plane: 2.9 }, 1.5, 0.4, 0.4, 0.02, anchors);
  return { s, anchors };
}

// --- Market Square ------------------------------------------------------------------------------

const CANOPY = [0xc4553f, 0xe0a63a, 0xd9803a, 0xc86a8a, 0x8a9a4a, 0x9a5a7a];
const STALL_STOCK = ['bread', 'vegetables', 'cheese', 'cloth', 'candles', 'cider'] as const;

/** What a stall sets out on its counter at (x, z); `n` pieces, 2 to 6. */
function stallGoods(
  s: ShapeBuilder,
  kind: string,
  x: number,
  y: number,
  z: number,
  n: number,
  rnd: () => number,
): void {
  switch (kind) {
    case 'bread':
      s.cylinder(x, z, 0.14, 0.16, y, y + 0.04, 0xa8794a, 8);
      for (let i = 0; i < n + 2; i++) {
        const a = i * 2.1;
        const r = i === 0 ? 0 : 0.07;
        s.blob(
          x + Math.cos(a) * r,
          y + 0.06,
          z + Math.sin(a) * r * 0.7,
          0.05,
          0.028,
          0.032,
          vary(GOOD_COLORS.bread, rnd, 0.6),
          1,
        );
      }
      break;
    case 'vegetables':
      for (let i = 0; i < n + 2; i++) {
        const hex = [GOOD_COLORS.cabbage, GOOD_COLORS.carrot, GOOD_COLORS.beet][i % 3]!;
        s.blob(
          x - 0.17 + (i % 4) * 0.115,
          y + 0.035,
          z + (i > 3 ? 0.07 : -0.05),
          0.05,
          0.04,
          0.05,
          vary(hex, rnd, 0.5),
          1,
        );
      }
      break;
    case 'cheese':
      for (let i = 0; i < Math.min(3, 1 + (n >> 1)); i++)
        cheeseWheel(s, x - 0.1 + i * 0.1, y + i * 0.01, z, 0.075, rnd);
      cheeseWheel(s, x - 0.02, y + 0.07, z, 0.06, rnd);
      break;
    case 'cloth':
      for (let i = 0; i < Math.min(4, n); i++) {
        const hex = [0xb85a4a, 0x4f6f9a, 0xd6c49a, 0x8fa37a][i]!;
        s.rbox(
          x - 0.2 + i * 0.1,
          y,
          z - 0.07,
          x - 0.11 + i * 0.1,
          y + 0.05 + (i % 2) * 0.05,
          z + 0.07,
          vary(hex, rnd, 0.5),
          0.01,
        );
      }
      break;
    case 'candles':
      for (let i = 0; i < n + 2; i++) {
        const cx = x - 0.18 + i * 0.07;
        s.cylinder(cx, z + ((i % 2) - 0.5) * 0.08, 0.016, 0.016, y, y + 0.11 + (i % 3) * 0.02, 0xf1e6c8, 5);
      }
      break;
    default:
      // Cider in a little keg, honey in jars.
      s.cylinder(x - 0.13, z, 0.07, 0.07, y, y + 0.12, vary(palette.wood, rnd, 0.5), 8);
      for (let i = 0; i < Math.min(4, n); i++)
        s.cylinder(x + 0.0 + i * 0.07, z + (i % 2) * 0.05 - 0.03, 0.025, 0.025, y, y + 0.06, 0xe0a63a, 6);
  }
}

function marketSquare(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const { rnd } = streams(opts, 63);
  const { s, anchors } = start(opts);
  // The paved square with a kerb round it and a ring of lighter stone about the cross.
  s.rbox(0.06, 0, 0.06, w - 0.06, 0.03, d - 0.06, vary(0xb4a994, rnd, 0.3), 0.02);
  s.detail(() => {
    for (const x of [0.06, w - 0.1]) s.box(x, 0.03, 0.06, x + 0.04, 0.05, d - 0.06, 0xcfc6b2);
    for (const z of [0.06, d - 0.1]) s.box(0.06, 0.03, z, w - 0.06, 0.05, z + 0.04, 0xcfc6b2);
    for (let i = 1; i < 6; i++) {
      s.box(0.1 + i * ((w - 0.2) / 6), 0.03, 0.1, 0.11 + i * ((w - 0.2) / 6), 0.034, d - 0.1, 0x9a907c);
      s.box(0.1, 0.03, 0.1 + i * ((d - 0.2) / 6), w - 0.1, 0.034, 0.11 + i * ((d - 0.2) / 6), 0x9a907c);
    }
  });
  const cx = w / 2;
  const cz = 1.12;
  // The market cross: three steps, a tall shaft and a cross-piece.
  s.cylinder(cx, cz, 0.27, 0.25, 0.03, 0.1, 0xcfc6b2, 8);
  s.cylinder(cx, cz, 0.2, 0.18, 0.1, 0.17, 0xbdb4a0, 8);
  s.cylinder(cx, cz, 0.13, 0.12, 0.17, 0.24, 0xcfc6b2, 8);
  s.box(cx - 0.045, 0.24, cz - 0.045, cx + 0.045, 0.78, cz + 0.045, 0xd6cdb8);
  s.box(cx - 0.13, 0.62, cz - 0.03, cx + 0.13, 0.68, cz + 0.03, 0xd6cdb8);
  s.box(cx - 0.06, 0.78, cz - 0.06, cx + 0.06, 0.84, cz + 0.06, 0xbdb4a0);
  // Six stalls in two rows of three, all open toward the entrance.
  const cols = [0.58, 1.5, 2.42];
  const rows = [0.15, 1.6];
  let i = 0;
  for (const sz of rows) {
    for (const sx of cols) {
      const colorHex = CANOPY[i]!;
      const kind = STALL_STOCK[i]!;
      const a = sx - 0.4;
      const b = sx + 0.4;
      const zb = sz;
      const zf = sz + 0.55;
      const stripe = vary(colorHex, rnd, 0.3);
      // Posts, tall at the back so the canopy slopes toward the customers.
      for (const [x, z, h] of [
        [a, zb, 0.8],
        [b, zb, 0.8],
        [a, zf, 0.6],
        [b, zf, 0.6],
      ] as const)
        s.detail(() => beam(s, [x, 0.03, z], [x, h, z], 0.022, palette.timber));
      // The counter and its cloth.
      s.detail(() => {
        s.rbox(a + 0.03, 0.03, zf - 0.26, b - 0.03, 0.3, zf - 0.02, vary(palette.wood, rnd, 0.5), 0.012);
        s.box(a + 0.02, 0.18, zf - 0.02, b - 0.02, 0.3, zf + 0.004, vary(colorHex, rnd, 0.4));
        s.box(a + 0.01, 0.3, zf - 0.28, b - 0.01, 0.315, zf, palette.white);
      });
      // Far off: the stall is a block under its canopy.
      if (s.low) s.box(a + 0.03, 0.03, zf - 0.26, b - 0.03, 0.55, zf - 0.02, 0x8a6a4a, 'tb');
      // The canopy in stripes with a scalloped fringe.
      const n = 4;
      for (let k = 0; k < n; k++) {
        const xa = a - 0.07 + ((b - a + 0.14) * k) / n;
        const xb = a - 0.07 + ((b - a + 0.14) * (k + 1)) / n;
        const hex = k % 2 === 0 ? stripe : 0xf1e8d4;
        panel(
          s,
          [xa, 0.84, zb - 0.1],
          [xb, 0.84, zb - 0.1],
          [xb, 0.62, zf + 0.14],
          [xa, 0.62, zf + 0.14],
          hex,
          vary(hex, rnd, 1.5),
        );
        s.nearOnly(() =>
          s.tri(
            [xa, 0.62, zf + 0.14],
            [xb, 0.62, zf + 0.14],
            [(xa + xb) / 2, 0.55, zf + 0.15],
            hex,
            [0, 0, 1],
          ),
        );
      }
      const lv = Math.max(0, Math.min(4, level(opts, `stock:${kind}`)));
      s.detail(() => stallGoods(s, kind, sx, 0.315, zf - 0.14, 2 + lv, rnd));
      i++;
    }
  }
  s.detail(() => {
    // Crates and barrels at the edges, and two lamp posts at the front corners.
    crateOf(s, 'vegetables', 0.35, 0.03, 2.55, rnd);
    crateOf(s, 'fruit', 0.55, 0.03, 2.62, rnd);
    barrel(s, w - 0.35, 0.03, 2.6, rnd, 0.9);
    for (const x of [0.18, w - 0.18]) {
      beam(s, [x, 0.03, d - 0.2], [x, 0.7, d - 0.2], 0.018, palette.timber);
      anchors.lights!.push(lamp(s, x, 0.7, d - 0.2));
    }
  });
  return { s, anchors };
}

export const brickworksKit = villageKit('brickworks', [3, 3], [1, 2], brickworks);
export const granaryKit = villageKit('granary', [3, 3], [1, 2], granary);
export const marketSquareKit = villageKit('market-square', [3, 3], [1, 2], marketSquare);
