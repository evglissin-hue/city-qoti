// C4E: the I2 chain buildings (docs/spec/13-ledger.md, Goods, I2 rows), each with a silhouette you
// can name from the default camera: the clay pit's terraced banks and pug mill, the brick kiln's
// bottle, the pasture's shepherd's hut, the spinner's porch wheel and dye pots, the weaver's long
// windows and tenter frame, the dairy's byre and churn stand, the cheesemaker's cellar, the orchard's
// rows (blossom, fruit, bare by season), the cider mill's stone wheel, the chopping shed's round
// woodstack, the herb garden's skeps and beds, and the smithy's forge. Runtime piles follow
// 'out:<good>' and 'in:<good>' levels like the I1 kits; 'season' (0 spring to 3 winter, or a name)
// dresses the fruit trees.
import { mixHex, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ, panel } from '../shapes';
import { shell, signBoard, windowRow, windowStyle, type Built } from './buildings';
import { postAndRail, trough } from './details';
import { cheeseWheel, GOOD_COLORS, pileOf, skein } from './goods';
import { chimneyPart, doorPart, faceBox, facePoint, hangingSign, windowPart, type Face } from './parts';
import {
  choppingBlock,
  flowerPot,
  groundPatch,
  hayBale,
  ladder,
  milkChurn,
  sawhorse,
  wallLantern,
  wattle,
  weathervane,
} from './props';
import { roofPart, type RoofMaterial } from './roofs';
import { customOf, level, roofColor, streams } from './style';
import type { Kit, KitAnchors, KitBuildOptions } from './types';

const CLAY = GOOD_COLORS.clay;
const CLAY_DARK = GOOD_COLORS.clayDark;
const IRON = 0x4b4f55;

function start(): Built {
  return { s: new ShapeBuilder(), anchors: { smoke: [], lights: [] } };
}

/** A building kit with the footprint it is drawn for (until its def says otherwise). */
export function villageKit(
  id: string,
  size: [number, number],
  entrance: [number, number],
  make: (o: KitBuildOptions | undefined) => Built,
): Kit {
  const withSize = (o: KitBuildOptions | undefined): KitBuildOptions => ({
    ...o,
    size: o?.size ?? size,
    entrance: o?.entrance ?? entrance,
  });
  return {
    id,
    kind: 'building',
    footprint: { size, entrance },
    build: (o) => make(withSize(o)).s.build(),
    anchors: (o) => make(withSize(o)).anchors,
  };
}

/** Post and rail all round a rect, with a gate gap at `gateU` on the front (z1) side. */
function paddock(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  gateU: number | null,
  rnd: () => number,
): void {
  postAndRail(s, [x0, z0], [x1, z0], rnd);
  postAndRail(s, [x0, z0], [x0, z1], rnd);
  postAndRail(s, [x1, z0], [x1, z1], rnd);
  if (gateU === null) postAndRail(s, [x0, z1], [x1, z1], rnd);
  else {
    postAndRail(s, [x0, z1], [gateU - 0.22, z1], rnd);
    postAndRail(s, [gateU + 0.22, z1], [x1, z1], rnd);
    // A five-bar gate swung half open.
    const hx = gateU - 0.22;
    const a: V3 = [hx, 0.04, z1];
    const b: V3 = [hx + 0.3, 0.04, z1 + 0.2];
    for (let i = 0; i < 4; i++) {
      const y = 0.06 + i * 0.055;
      beam(s, [a[0], y, a[2]], [b[0], y, b[2]], 0.009, palette.white);
    }
    beam(s, [a[0], 0.06, a[2]], [b[0], 0.23, b[2]], 0.008, palette.white);
    beam(s, [b[0], 0.04, b[2]], [b[0], 0.25, b[2]], 0.01, palette.white);
  }
}

/** The season as 0 spring to 3 winter, from a name or a number (summer when absent). */
export function seasonOf(opts: KitBuildOptions | undefined): number {
  const v = opts?.params?.season;
  if (typeof v === 'number' && Number.isFinite(v)) return ((Math.floor(v) % 4) + 4) % 4;
  if (typeof v === 'string') {
    const i = ['spring', 'summer', 'autumn', 'winter'].indexOf(v);
    if (i >= 0) return i;
  }
  return 1;
}

/**
 * An orchard apple tree for a season: blossom in spring, green with small fruit in summer, red
 * apples among warming leaves in autumn, bare branches in winter. About 0.75 tall at k 1.
 */
export function orchardTree(
  s: ShapeBuilder,
  x: number,
  z: number,
  k: number,
  season: number,
  rnd: () => number,
  lowDetail = false,
): void {
  const trunk = vary(palette.bark, rnd, 0.6);
  s.cylinder(x, z, 0.05 * k, 0.035 * k, 0, 0.32 * k, trunk, 5);
  // Three short boughs splaying out to hold the crown.
  const a0 = rnd() * Math.PI * 2;
  const tips: V3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i / 3) * Math.PI * 2;
    const tip: V3 = [x + Math.cos(a) * 0.17 * k, 0.5 * k, z + Math.sin(a) * 0.17 * k];
    tips.push(tip);
    if (!lowDetail || season === 3) beam(s, [x, 0.28 * k, z], tip, 0.02 * k, trunk);
  }
  if (season === 3) {
    // Winter: twigs and a last few stubborn apples.
    for (const t of tips) {
      for (let j = 0; j < 2; j++) {
        const a = rnd() * Math.PI * 2;
        beam(
          s,
          t,
          [t[0] + Math.cos(a) * 0.1 * k, t[1] + 0.1 * k, t[2] + Math.sin(a) * 0.1 * k],
          0.008 * k,
          trunk,
        );
      }
    }
    return;
  }
  const leaf =
    season === 0
      ? vary(0x9cc06a, rnd, 0.6)
      : season === 2
        ? vary(mixHex(palette.leaf, palette.autumnGold, 0.35), rnd, 0.8)
        : vary(palette.leaf, rnd, 0.7);
  const top = mixHex(leaf, season === 0 ? 0xf7e8ee : 0xc8e070, season === 0 ? 0.25 : 0.15);
  s.blob(x, 0.6 * k, z, 0.3 * k, 0.22 * k, 0.3 * k, leaf, lowDetail ? 0 : 1, rnd, 0.1, top);
  if (!lowDetail) {
    for (const t of tips)
      s.blob(
        t[0],
        t[1] + 0.06 * k,
        t[2],
        0.17 * k,
        0.14 * k,
        0.17 * k,
        vary(leaf, rnd, 1),
        1,
        rnd,
        0.12,
        top,
      );
  }
  const n = lowDetail ? 3 : 9;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = (0.22 + rnd() * 0.12) * k;
    const y = (0.48 + rnd() * 0.24) * k;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    if (season === 0) {
      s.blob(
        px,
        y + 0.03 * k,
        pz,
        0.05 * k,
        0.035 * k,
        0.05 * k,
        vary(i % 3 ? palette.blossom : palette.white, rnd, 0.4),
        0,
      );
    } else {
      const fruit = season === 2 ? (i % 4 ? palette.apple : 0xd9a03a) : vary(0xa8c45a, rnd, 0.5);
      const r2 = (season === 2 ? 0.032 : 0.022) * k;
      s.blob(px, y, pz, r2, r2, r2, fruit, 0);
    }
  }
}

// --- Clay pit -----------------------------------------------------------------------------------

/** A horse-gin pug mill: a round tub, a central shaft and a long sweep arm. */
function pugMill(s: ShapeBuilder, x: number, z: number, rnd: () => number, tub = CLAY_DARK): void {
  s.cylinder(x, z, 0.24, 0.26, 0, 0.2, vary(palette.wood, rnd, 0.5), 10);
  s.cylinder(x, z, 0.21, 0.21, 0.2, 0.205, vary(tub, rnd, 0.5), 10);
  for (const y of [0.05, 0.16]) s.cylinder(x, z, 0.262, 0.262, y, y + 0.02, IRON, 10);
  beam(s, [x, 0.2, z], [x, 0.52, z], 0.025, palette.timber);
  beam(s, [x - 0.02, 0.42, z], [x + 0.62, 0.38, z + 0.1], 0.022, vary(palette.wood, rnd, 0.6));
  s.box(x - 0.04, 0.52, z - 0.04, x + 0.04, 0.56, z + 0.04, IRON);
}

function wheelbarrow(s: ShapeBuilder, x: number, z: number, load: number, rnd: () => number): void {
  const wood = vary(palette.wood, rnd, 0.6);
  s.rbox(x - 0.09, 0.08, z - 0.12, x + 0.09, 0.16, z + 0.08, wood, 0.012);
  s.blob(x, 0.16, z - 0.02, 0.08, 0.04, 0.09, load, 0);
  cylX(s, x - 0.015, x + 0.015, 0.06, z + 0.14, 0.06, palette.darkWood, 8);
  for (const dx of [-0.07, 0.07]) {
    beam(s, [x + dx, 0.12, z + 0.1], [x + dx * 0.4, 0.06, z + 0.14], 0.01, palette.timber);
    beam(s, [x + dx, 0.12, z - 0.1], [x + dx * 1.3, 0.14, z - 0.32], 0.01, palette.timber);
    beam(s, [x + dx, 0.08, z - 0.08], [x + dx, 0, z - 0.1], 0.01, palette.timber);
  }
}

function spade(s: ShapeBuilder, x: number, z: number, lean: number): void {
  beam(s, [x, 0, z], [x + lean, 0.34, z + 0.02], 0.009, palette.wood);
  s.box(x - 0.03, -0.02, z - 0.008, x + 0.03, 0.07, z + 0.008, IRON);
  beam(s, [x + lean - 0.04, 0.34, z + 0.02], [x + lean + 0.04, 0.34, z + 0.02], 0.008, palette.wood);
}

function clayPit(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const { rnd } = streams(opts, 41);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  // The pit: dug banks of clay round three sides, turf still on top, cut in steps down to a floor
  // of wet clay with a puddle; the open side faces the lane for the barrows.
  const px0 = 0.2;
  const pz0 = 0.15;
  const px1 = w - 0.2;
  const pz1 = d - 0.95;
  groundPatch(s, 0.08, 0.08, w - 0.08, d - 0.08, vary(0xb08a5e, rnd, 0.4), rnd);
  s.rbox(px0 + 0.3, 0, pz0 + 0.3, px1 - 0.3, 0.014, pz1, vary(0x9a5532, rnd, 0.4), 0.05);
  s.blob((px0 + px1) / 2 - 0.1, 0.016, (pz0 + pz1) / 2 + 0.1, 0.34, 0.006, 0.2, 0x6f8f8a, 0);
  const TURF = 0x7f8a4a;
  const bank = (x0: number, z0: number, x1: number, z1: number, h: number): void => {
    s.rbox(x0, 0, z0, x1, h, z1, vary(CLAY, rnd, 0.5), 0.03);
    s.rbox(x0 - 0.01, h - 0.035, z0 - 0.01, x1 + 0.01, h + 0.02, z1 + 0.01, vary(TURF, rnd, 0.6), 0.02);
    // A darker band of wet clay along the foot of the cut.
    s.box(x0 - 0.004, 0.03, z0 - 0.004, x1 + 0.004, 0.07, z1 + 0.004, vary(CLAY_DARK, rnd, 0.4));
  };
  // Back bank with a lower step in front of it, then the two side banks stepping down to the lane.
  bank(px0, pz0, px1, pz0 + 0.32, 0.42);
  bank(px0 + 0.32, pz0 + 0.32, px1 - 0.32, pz0 + 0.52, 0.2);
  bank(px0, pz0 + 0.32, px0 + 0.3, pz1, 0.34);
  bank(px1 - 0.3, pz0 + 0.32, px1, pz1 - 0.2, 0.26);
  bank(px0, pz1, px0 + 0.3, pz1 + 0.25, 0.16);
  if (!plain) {
    // Spade marks in the fresh cut of the back bank.
    for (let i = 0; i < 8; i++) {
      const x = px0 + 0.4 + i * ((px1 - px0 - 0.8) / 7);
      s.box(x - 0.025, 0.24, pz0 + 0.3, x + 0.025, 0.36, pz0 + 0.335, vary(CLAY_DARK, rnd, 0.6));
    }
    // A plank run up the side bank, a barrow of clay at the top, spades stuck in the floor.
    beam(
      s,
      [px1 - 0.45, 0.02, (pz0 + pz1) / 2 + 0.2],
      [px1 - 0.18, 0.27, (pz0 + pz1) / 2 - 0.1],
      0.05,
      vary(palette.wood, rnd, 0.5),
    );
    wheelbarrow(s, px1 - 0.55, pz1 + 0.3, CLAY, rnd);
    spade(s, px0 + 0.6, (pz0 + pz1) / 2 + 0.2, 0.06);
    spade(s, px0 + 0.75, (pz0 + pz1) / 2 + 0.25, -0.05);
    // The pug mill working the clay, and blocks drying on boards under a little roof.
    pugMill(s, w - 0.55, d - 0.45, rnd);
    const dx0 = 0.2;
    const dx1 = Math.min(1.35, w - 1.05);
    const dz0 = d - 0.78;
    const dz1 = d - 0.18;
    for (const [x, z] of [
      [dx0, dz0],
      [dx1, dz0],
      [dx0, dz1],
      [dx1, dz1],
    ] as const)
      beam(s, [x, 0, z], [x, 0.42, z], 0.018, palette.timber);
    roofPart(s, {
      shape: 'gable',
      material: 'shingle',
      x0: dx0 - 0.1,
      z0: dz0 - 0.12,
      x1: dx1 + 0.1,
      z1: dz1 + 0.12,
      y0: 0.4,
      y1: 0.6,
      color: vary(0x8a6f58, rnd, 0.4),
      trim: palette.timber,
      ridgeAlongX: true,
      rnd,
    });
    for (const z of [dz0 + 0.15, dz1 - 0.15]) {
      s.box(dx0 + 0.05, 0.1, z - 0.07, dx1 - 0.05, 0.12, z + 0.07, vary(palette.wood, rnd, 0.5));
      const n = Math.floor((dx1 - dx0 - 0.1) / 0.09);
      for (let i = 0; i < n; i++) {
        const x = dx0 + 0.1 + i * 0.09;
        s.box(x - 0.03, 0.12, z - 0.05, x + 0.03, 0.17, z + 0.05, vary(CLAY, rnd, 0.6));
      }
    }
  }
  pileOf(s, 'clay', Math.max(1, level(opts, 'out:clay')), w - 1.1, 0, d - 0.45, rnd);
  return { s, anchors };
}

// --- Brick kiln ---------------------------------------------------------------------------------

/** A bottle kiln: a flared brick hovel narrowing to a chimney neck. Returns the smoke anchor. */
function bottleKiln(s: ShapeBuilder, x: number, z: number, rnd: () => number, lights: V3[]): V3 {
  const rings: [number, number][] = [
    [0, 0.62],
    [0.35, 0.6],
    [0.8, 0.5],
    [1.15, 0.32],
    [1.38, 0.19],
    [1.75, 0.16],
  ];
  for (let i = 0; i < rings.length - 1; i++) {
    const [y0, r0] = rings[i]!;
    const [y1, r1] = rings[i + 1]!;
    s.cylinder(x, z, r0, r1, y0, y1, vary(palette.brick, rnd, 0.5), 12);
  }
  // Courses of darker brick every so often, so the bottle reads as built, not poured.
  for (let i = 1; i < 9; i++) {
    const y = i * 0.17;
    let r = 0.6;
    for (let k = 0; k < rings.length - 1; k++) {
      const [y0, r0] = rings[k]!;
      const [y1, r1] = rings[k + 1]!;
      if (y >= y0 && y <= y1) r = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    s.cylinder(x, z, r + 0.006, r + 0.006, y, y + 0.025, vary(GOOD_COLORS.brickDark, rnd, 0.4), 12);
  }
  // Iron bands round the belly, a soot-dark rim at the top.
  for (const y of [0.25, 0.55]) {
    const t = y / 0.8;
    const r = 0.6 - 0.1 * t + 0.012;
    s.cylinder(x, z, r, r - 0.005, y, y + 0.03, IRON, 12);
  }
  s.cylinder(x, z, 0.19, 0.19, 1.75, 1.8, 0x3b3229, 12);
  // The firing mouth: an arched opening with a fire glowing inside.
  const front: Face = { dir: 'z+', plane: z + 0.6 };
  faceBox(s, front, x - 0.16, 0, -0.02, x + 0.16, 0.3, 0.03, vary(GOOD_COLORS.brickDark, rnd, 0.3));
  s.glow(2);
  faceBox(s, front, x - 0.11, 0.02, 0.03, x + 0.11, 0.22, 0.035, 0xffa04a);
  s.glow(0);
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI;
    const a1 = ((i + 1) / 4) * Math.PI;
    s.tri(
      facePoint(front, x, 0.22, 0.036),
      facePoint(front, x + Math.cos(a0) * 0.11, 0.22 + Math.sin(a0) * 0.06, 0.036),
      facePoint(front, x + Math.cos(a1) * 0.11, 0.22 + Math.sin(a1) * 0.06, 0.036),
      0x3b3229,
      [0, 0, 1],
    );
  }
  lights.push(facePoint(front, x, 0.12, 0.12));
  return [x, 1.85, z];
}

function brickKiln(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const { rnd } = streams(opts, 42);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  groundPatch(s, 0.08, 0.08, w - 0.08, d - 0.08, vary(0xa89276, rnd, 0.4), rnd);
  const kx = 0.85;
  const kz = 0.95;
  anchors.smoke!.push(bottleKiln(s, kx, kz, rnd, anchors.lights!));
  // The hack shed: a long roof on posts sheltering rows of green bricks drying.
  const hx0 = 1.75;
  const hx1 = w - 0.15;
  const hz0 = 0.2;
  const hz1 = d - 0.85;
  if (hx1 - hx0 > 0.5) {
    const posts = Math.max(2, Math.round((hz1 - hz0) / 0.6));
    for (let i = 0; i <= posts; i++) {
      const z = hz0 + ((hz1 - hz0) * i) / posts;
      for (const x of [hx0, hx1]) beam(s, [x, 0, z], [x, 0.5, z], 0.02, palette.timber);
    }
    roofPart(s, {
      shape: 'gable',
      material: c.roofMaterial ?? 'tile',
      x0: hx0 - 0.12,
      z0: hz0 - 0.1,
      x1: hx1 + 0.12,
      z1: hz1 + 0.1,
      y0: 0.48,
      y1: 0.76,
      color: vary(roofColor(c, c.roofMaterial ?? 'tile'), rnd, 0.5),
      trim: palette.timber,
      ridgeAlongX: false,
      rnd,
    });
    if (!plain) {
      for (let r = 0; r < 2; r++) {
        const x = hx0 + 0.15 + r * (hx1 - hx0 - 0.3);
        for (let l = 0; l < 3; l++) {
          const n = Math.floor((hz1 - hz0 - 0.1) / 0.08);
          for (let i = 0; i < n; i++) {
            const z = hz0 + 0.08 + i * 0.08 + (l % 2) * 0.03;
            if (z > hz1 - 0.05) continue;
            s.box(
              x - 0.07,
              l * 0.035,
              z - 0.025,
              x + 0.07,
              l * 0.035 + 0.03,
              z + 0.025,
              vary(CLAY, rnd, 0.6),
            );
          }
        }
      }
    }
  }
  if (!plain) {
    // Fuel for the firing, a barrow and the moulding bench.
    pileOf(s, 'firewood', Math.max(1, level(opts, 'in:firewood')), kx - 0.05, 0, d - 0.35, rnd);
    wheelbarrow(s, kx + 0.75, kz + 0.75, CLAY, rnd);
    s.box(0.15, 0.18, 0.15, 0.6, 0.21, 0.35, vary(palette.wood, rnd, 0.5));
    for (const x of [0.2, 0.55]) beam(s, [x, 0, 0.25], [x, 0.18, 0.25], 0.015, palette.timber);
    for (let i = 0; i < 3; i++)
      s.box(0.25 + i * 0.1, 0.21, 0.2, 0.32 + i * 0.1, 0.25, 0.3, vary(CLAY, rnd, 0.5));
  }
  // Fired bricks stacked on pallets in front, rising with the output.
  pileOf(s, 'bricks', Math.max(1, level(opts, 'out:bricks')), w - 0.75, 0, d - 0.4, rnd);
  if (c.sign) signBoard(s, { dir: 'z+', plane: hz1 + 0.1 }, (hx0 + hx1) / 2, 0.42, 0.4, 0.02, anchors);
  return { s, anchors };
}

// --- Sheep pasture ------------------------------------------------------------------------------

/** A shepherd's hut: a little wheeled cabin with a curved roof and a stovepipe. */
function shepherdsHut(s: ShapeBuilder, x: number, z: number, rnd: () => number, anchors: KitAnchors): void {
  const L = 0.36;
  const W = 0.2;
  const body = vary(0x6e8a5a, rnd, 0.5);
  s.rbox(x - L, 0.12, z - W, x + L, 0.42, z + W, body, 0.015);
  // The curved roof: a few facets over the length.
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI;
    const a1 = ((i + 1) / seg) * Math.PI;
    const p = (a: number, xx: number): V3 => [xx, 0.42 + Math.sin(a) * 0.12, z + Math.cos(a) * (W + 0.04)];
    s.quad(p(a0, x - L - 0.04), p(a0, x + L + 0.04), p(a1, x + L + 0.04), p(a1, x - L - 0.04), 0x8f969c, [
      0,
      Math.sin((a0 + a1) / 2),
      Math.cos((a0 + a1) / 2),
    ]);
    s.tri([x - L, 0.42, z], p(a0, x - L), p(a1, x - L), body, [-1, 0, 0]);
    s.tri([x + L, 0.42, z], p(a0, x + L), p(a1, x + L), body, [1, 0, 0]);
  }
  // Iron wheels, a door at one end with steps, a window and the stovepipe.
  for (const dx of [-L + 0.1, L - 0.1])
    for (const dz of [-W - 0.01, W + 0.01])
      cylZ(s, z + dz - 0.012, z + dz + 0.012, x + dx, 0.08, 0.08, IRON, 8);
  s.box(x + L, 0.14, z - 0.08, x + L + 0.012, 0.38, z + 0.08, palette.mustard);
  s.box(x + L + 0.02, 0.0, z - 0.07, x + L + 0.14, 0.03, z + 0.07, palette.wood);
  s.box(x + L + 0.02, 0.06, z - 0.07, x + L + 0.1, 0.09, z + 0.07, palette.wood);
  windowPart(
    s,
    { dir: 'z+', plane: z + W },
    x,
    0.3,
    0.12,
    0.1,
    { frame: palette.white, shutter: null, box: false, flowers: [] },
    rnd,
    anchors.lights,
  );
  s.cylinder(x - L + 0.12, z - 0.06, 0.02, 0.02, 0.5, 0.68, IRON, 6);
  anchors.smoke!.push([x - L + 0.12, 0.72, z - 0.06]);
}

function sheepPasture(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [4, 4];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd } = streams(opts, 43);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const gateU = ex + 0.5;
  paddock(s, 0.08, 0.08, w - 0.08, d - 0.08, gateU, rnd);
  // A field shelter in the back corner: three closed sides and a lean roof.
  const sx0 = w - 1.25;
  const sx1 = w - 0.2;
  const sz0 = 0.2;
  const sz1 = 0.85;
  const board = vary(0x8a6f58, rnd, 0.5);
  s.box(sx0, 0, sz0, sx1, 0.5, sz0 + 0.05, board);
  s.box(sx0, 0, sz0, sx0 + 0.05, 0.42, sz1, board);
  s.box(sx1 - 0.05, 0, sz0, sx1, 0.42, sz1, board);
  roofPart(s, {
    shape: 'lean',
    material: 'shingle',
    x0: sx0 - 0.08,
    z0: sz0 - 0.08,
    x1: sx1 + 0.08,
    z1: sz1 + 0.12,
    y0: 0.4,
    y1: 0.56,
    color: vary(0x6b625c, rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  if (!plain) {
    // A hay rack under the shelter, a trough, the shepherd's hut by the gate.
    s.box(sx0 + 0.15, 0.18, sz0 + 0.08, sx1 - 0.15, 0.36, sz0 + 0.2, vary(palette.wood, rnd, 0.6));
    s.blob((sx0 + sx1) / 2, 0.36, sz0 + 0.14, (sx1 - sx0) / 2 - 0.15, 0.06, 0.07, 0xdcbc6a, 1);
    trough(s, 0.5, 0.45, true, false);
    shepherdsHut(s, 0.6, d - 0.55, rnd, anchors);
    hayBale(s, w - 0.45, 0, d - 0.4, false, rnd);
    pileOf(s, 'wool', Math.max(1, level(opts, 'out:wool')), gateU + 0.6, 0, d - 0.42, rnd);
  }
  const n = Math.max(3, Math.round((w * d) / 3));
  anchors.animals = [{ kind: 'sheep', pen: [0.3, 0.95, w - 0.3, d - 0.9], count: n }];
  return { s, anchors };
}

// --- Spinner ------------------------------------------------------------------------------------

/** A spinning wheel: a big drive wheel on a slanted bench with a treadle and a spindle. */
function spinningWheel(s: ShapeBuilder, x: number, y: number, z: number, rnd: () => number): void {
  const wood = vary(0x9a6b43, rnd, 0.5);
  beam(s, [x - 0.12, y + 0.08, z], [x + 0.12, y + 0.12, z], 0.018, wood);
  for (const [dx, dz] of [
    [-0.1, -0.04],
    [-0.1, 0.04],
    [0.1, 0],
  ] as const)
    beam(s, [x + dx, y + 0.09, z + dz], [x + dx * 1.2, y, z + dz * 1.5], 0.01, wood);
  // The wheel: a rim of segments and a few spokes.
  const cx = x + 0.04;
  const cy = y + 0.24;
  const r = 0.12;
  const seg = 10;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    beam(
      s,
      [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z],
      [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z],
      0.008,
      wood,
    );
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    beam(
      s,
      [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z],
      [cx - Math.cos(a) * r, cy - Math.sin(a) * r, z],
      0.004,
      wood,
    );
  }
  for (const dz of [-0.03, 0.03]) beam(s, [cx, y + 0.1, z + dz], [cx, cy, z + dz], 0.008, wood);
  // The flyer and a bobbin of yarn.
  beam(s, [x - 0.09, y + 0.12, z], [x - 0.09, y + 0.24, z], 0.008, wood);
  s.blob(x - 0.09, y + 0.26, z, 0.025, 0.02, 0.04, GOOD_COLORS.yarnA, 0);
}

function spinner(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 44);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.22;
  const x1 = w - 0.22;
  const z0 = 0.25;
  const z1 = d - 0.62;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.6 ? 'thatch' : 'tile');
  const accent = c.accent ?? [palette.teal, 0x7f9a52, palette.accentRed][Math.floor(look() * 3)]!;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: 0.74,
    wall: look() < 0.5 ? 'plaster' : 'timber',
    wallColor:
      c.wall ??
      vary(
        [palette.plasterRose, palette.plasterSky, palette.plasterCream][Math.floor(look() * 3)]!,
        rnd,
        0.4,
      ),
    trim: palette.timber,
    roof: {
      shape: 'halfHip',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.6,
      overhang: 0.16,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.26, 0.58, accent, palette.timber, 'dutch', 0.012);
  // The porch: a deep veranda across the front on posts, the wheel set out in the light.
  const pz = z1 + 0.38;
  for (const x of [x0 + 0.04, x1 - 0.04, (x0 + doorU) / 2])
    beam(s, [x, 0, pz], [x, 0.74, pz], 0.022, palette.timber);
  s.box(x0, 0, z1, x1, 0.05, pz + 0.04, vary(palette.wood, rnd, 0.5));
  roofPart(s, {
    shape: 'lean',
    material: material === 'thatch' ? 'shingle' : material,
    x0: x0 - 0.06,
    z0: z1 - 0.02,
    x1: x1 + 0.06,
    z1: pz + 0.1,
    y0: 0.72,
    y1: 0.86,
    color: vary(material === 'thatch' ? 0x8a6f58 : roofColor(c, material), rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  if (!plain) {
    spinningWheel(s, x0 + 0.35, 0.05, z1 + 0.2, rnd);
    s.cylinder(x0 + 0.62, z1 + 0.18, 0.07, 0.08, 0.05, 0.14, vary(GOOD_COLORS.wicker, rnd, 0.5), 8);
    s.blob(x0 + 0.62, 0.16, z1 + 0.18, 0.08, 0.05, 0.08, GOOD_COLORS.wool, 1);
    // Skeins hanging from a rail under the porch roof.
    beam(s, [doorU + 0.22, 0.66, pz - 0.02], [x1 - 0.06, 0.66, pz - 0.02], 0.008, palette.timber);
    const yarns = [GOOD_COLORS.yarnA, GOOD_COLORS.yarnB, GOOD_COLORS.yarnC, 0x8fa37a, GOOD_COLORS.wool];
    const n = Math.max(2, Math.floor((x1 - doorU - 0.3) / 0.11));
    for (let i = 0; i < n; i++) {
      const x = doorU + 0.3 + i * 0.11;
      beam(s, [x, 0.66, pz - 0.02], [x, 0.58, pz - 0.02], 0.003, 0xbfa27a);
      s.blob(x, 0.52, pz - 0.02, 0.03, 0.06, 0.02, vary(yarns[i % yarns.length]!, rnd, 0.4), 0);
    }
    // Dye pots round the side: madder red, woad blue, weld yellow.
    const dz = (z0 + z1) / 2;
    for (const [i, col] of [GOOD_COLORS.yarnA, GOOD_COLORS.yarnB, GOOD_COLORS.yarnC].entries()) {
      const px = w - 0.12;
      const pzz = dz - 0.3 + i * 0.26;
      if (px - 0.1 < x1) continue;
      s.cylinder(px, pzz, 0.075, 0.09, 0, 0.13, IRON, 8);
      s.cylinder(px, pzz, 0.068, 0.068, 0.13, 0.132, col, 8);
    }
    const style = windowStyle(c, accent, { box: true, shutters: look() < 0.5 });
    windowRow(s, front, x0, x1, 0.5, style, rnd, anchors.lights!, [doorU], 0.6, [0.2, 0.22], 0.012);
    windowPart(
      s,
      { dir: 'x-', plane: x0 },
      dz,
      0.5,
      0.18,
      0.2,
      { ...style, box: false },
      rnd,
      anchors.lights,
      0.012,
    );
    windowPart(
      s,
      { dir: 'z-', plane: z0 },
      (x0 + x1) / 2,
      0.5,
      0.2,
      0.22,
      { ...style, box: false },
      rnd,
      anchors.lights,
      0.012,
    );
    hangingSign(s, { dir: 'z+', plane: pz }, x1 - 0.02, 0.7, vary(palette.paper, rnd, 0.3), (ss, ctr) => {
      for (const k of [-1, 1]) skein(ss, ctr[0] + k * 0.022, ctr[1], ctr[2], GOOD_COLORS.yarnB, rnd);
    });
    flowerPot(s, doorU + 0.22, 0.05, z1 + 0.1, rnd);
  }
  if (c.chimney ?? true)
    anchors.smoke!.push(chimneyPart(s, x1 - 0.3, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.1, palette.brick));
  pileOf(s, 'yarn', level(opts, 'out:yarn'), 0.45, 0, d - 0.18, rnd);
  if (c.sign) signBoard(s, front, doorU, 0.8, 0.42, 0.012, anchors);
  return { s, anchors };
}

// --- Weaver -------------------------------------------------------------------------------------

/** A tenter frame: a long low frame with lengths of cloth stretched to dry. */
function tenterFrame(
  s: ShapeBuilder,
  x0: number,
  x1: number,
  z: number,
  rnd: () => number,
  colors: number[],
): void {
  const n = Math.max(2, Math.round((x1 - x0) / 0.35));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    beam(s, [x, 0, z], [x, 0.36, z], 0.012, palette.timber);
  }
  beam(s, [x0, 0.34, z], [x1, 0.34, z], 0.01, palette.timber);
  beam(s, [x0, 0.08, z], [x1, 0.08, z], 0.01, palette.timber);
  for (let i = 0; i < n; i++) {
    const a = x0 + ((x1 - x0) * i) / n + 0.02;
    const b = x0 + ((x1 - x0) * (i + 1)) / n - 0.02;
    const col = vary(colors[i % colors.length]!, rnd, 0.4);
    panel(s, [a, 0.33, z], [b, 0.33, z], [b, 0.09, z], [a, 0.09, z], col, vary(col, rnd, 1.2));
  }
}

function weaver(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 45);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.2;
  const z1 = d - 0.75;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'slate' : 'tile');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 1.34,
    wall: 'stone',
    wallColor: vary(palette.stone, rnd, 0.6),
    trim: palette.timber,
    upper: {
      at: 0.66,
      wall: look() < 0.5 ? 'weatherboard' : 'plaster',
      color: c.wall ?? vary(look() < 0.5 ? 0x7d8fa0 : palette.plasterCream, rnd, 0.4),
      jetty: 0.02,
    },
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.6,
      overhang: 0.14,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const [ox0, oz0, ox1, oz1] = sh.outer;
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.26, 0.56, c.accent ?? palette.navy, palette.timber, 'plank', 0.015);
  if (!plain) {
    // The weavers' windows: long bands of small panes along the loom floor, both sides.
    const loom: Face[] = [
      { dir: 'x+', plane: ox1 },
      { dir: 'x-', plane: ox0 },
    ];
    for (const f of loom) {
      const n = Math.max(3, Math.floor((oz1 - oz0 - 0.2) / 0.16));
      faceBox(s, f, oz0 + 0.08, 0.86, 0.01, oz1 - 0.08, 1.2, 0.03, palette.white);
      s.glow(1);
      faceBox(s, f, oz0 + 0.11, 0.89, 0.03, oz1 - 0.11, 1.17, 0.035, palette.windowDay);
      s.glow(0);
      for (let i = 1; i < n; i++) {
        const u = oz0 + 0.11 + ((oz1 - oz0 - 0.22) * i) / n;
        faceBox(s, f, u - 0.007, 0.89, 0.035, u + 0.007, 1.17, 0.042, palette.white);
      }
      faceBox(s, f, oz0 + 0.11, 1.025, 0.035, oz1 - 0.11, 1.035, 0.042, palette.white);
      anchors.lights!.push(facePoint(f, (oz0 + oz1) / 2, 1.03, 0.08));
    }
    const style = windowStyle(c, c.accent ?? palette.navy, { box: true, shutters: false });
    windowRow(s, front, x0, x1, 0.42, style, rnd, anchors.lights!, [doorU], 0.6, [0.2, 0.22], 0.015);
    windowRow(
      s,
      { dir: 'z+', plane: oz1 },
      ox0,
      ox1,
      1.04,
      { ...style, box: false },
      rnd,
      anchors.lights!,
      [],
      0.45,
      [0.26, 0.26],
      0.012,
    );
    // Bolts of cloth on the bench by the door, the tenter frame along the front.
    tenterFrame(s, 0.15, w - 0.15, d - 0.2, rnd, [GOOD_COLORS.cloth, GOOD_COLORS.clothB, 0x8fa37a, 0xd6c49a]);
    hangingSign(s, front, x1 - 0.06, 0.7, vary(palette.paper, rnd, 0.3), (ss, ctr) => {
      for (const k of [-1, 1])
        ss.blob(ctr[0] + k * 0.02, ctr[1], ctr[2], 0.012, 0.03, 0.07, GOOD_COLORS.cloth, 0);
    });
    anchors.lights!.push(wallLantern(s, facePoint(front, doorU - 0.24, 0.66, 0.015), [0, 0, 1]));
  }
  pileOf(s, 'cloth', level(opts, 'out:cloth'), x0 + 0.42, 0, z1 + 0.28, rnd);
  pileOf(s, 'yarn', level(opts, 'in:yarn'), x1 - 0.3, 0, z1 + 0.25, rnd);
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(s, (x0 + x1) / 2, z0 + 0.3, sh.top - 0.1, sh.ridge + 0.02, palette.brick),
    );
  if (c.sign) signBoard(s, front, doorU, 0.78, 0.42, 0.015, anchors);
  return { s, anchors };
}

// --- Dairy --------------------------------------------------------------------------------------

function dairy(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 46);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  // The byre along the back, its long side to the yard; the paddock in front of it.
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.18;
  const z1 = 1.18;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'slate' : 'tile');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.06,
    wallH: 0.66,
    wall: look() < 0.5 ? 'stone' : 'plaster',
    wallColor: c.wall ?? vary(look() < 0.5 ? palette.stone : 0xf3ecdc, rnd, 0.4),
    trim: palette.timber,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.55,
      overhang: 0.14,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const accent = c.accent ?? palette.navy;
  // Stable doors in a row, top halves open.
  const doors = Math.max(2, Math.floor((x1 - x0) / 0.7));
  for (let i = 0; i < doors; i++) {
    const u = x0 + ((x1 - x0) * (i + 0.5)) / doors;
    doorPart(s, front, u, 0.26, 0.5, accent, palette.white, 'dutch', 0.015);
    faceBox(s, front, u - 0.11, 0.3, 0.04, u + 0.11, 0.48, 0.046, 0x3b3229);
  }
  // A louvred vent on the ridge.
  const vx = (x0 + x1) / 2;
  const vz = (z0 + z1) / 2;
  s.box(vx - 0.14, sh.ridge - 0.05, vz - 0.1, vx + 0.14, sh.ridge + 0.14, vz + 0.1, palette.white);
  for (let i = 0; i < 3; i++)
    s.box(
      vx - 0.145,
      sh.ridge + 0.0 + i * 0.045,
      vz - 0.105,
      vx + 0.145,
      sh.ridge + 0.02 + i * 0.045,
      vz + 0.105,
      vary(palette.wood, rnd, 0.4),
    );
  s.gable(
    vx - 0.18,
    vz - 0.13,
    vx + 0.18,
    vz + 0.13,
    sh.ridge + 0.14,
    sh.ridge + 0.26,
    vary(sh.roof.color, rnd, 0.3),
    true,
  );
  if (!plain) weathervane(s, vx, sh.ridge + 0.25, vz);
  // The paddock: cows graze between the byre and the lane.
  const gateU = ex + 0.5;
  paddock(s, 0.1, z1 + 0.25, w - 0.1, d - 0.08, gateU, rnd);
  anchors.animals = [
    { kind: 'cow', pen: [0.4, z1 + 0.5, w - 0.4, d - 0.35], count: Math.max(2, Math.round(w * 0.8)) },
  ];
  if (!plain) {
    trough(s, w - 0.45, z1 + 0.45, true, true);
    // The churn stand by the gate: a platform at cart height with churns waiting.
    const cx = gateU < w / 2 ? w - 0.55 : 0.55;
    const cz = d - 0.32;
    s.box(cx - 0.24, 0.24, cz - 0.15, cx + 0.24, 0.27, cz + 0.15, vary(palette.wood, rnd, 0.5));
    for (const dx of [-0.2, 0.2])
      for (const dz of [-0.11, 0.11])
        beam(s, [cx + dx, 0, cz + dz], [cx + dx, 0.24, cz + dz], 0.016, palette.timber);
    const churns = Math.max(2, Math.min(4, level(opts, 'out:milk') + 1));
    for (let i = 0; i < churns; i++) {
      const px = cx - 0.15 + i * 0.1;
      s.cylinder(px, cz, 0.04, 0.04, 0.27, 0.39, 0xb9bdc0, 8);
      s.cylinder(px, cz, 0.04, 0.022, 0.39, 0.42, 0xb9bdc0, 8);
    }
    milkChurn(s, x1 - 0.1, z1 + 0.12);
    s.cylinder(x0 + 0.2, z1 + 0.14, 0.06, 0.05, 0, 0.1, vary(palette.wood, rnd, 0.5), 8);
    hayBale(s, x0 + 0.5, 0, z1 + 0.14, true, rnd);
    windowRow(
      s,
      { dir: 'x+', plane: x1 },
      z0,
      z1,
      0.45,
      windowStyle(c, accent, { box: false, shutters: false }),
      rnd,
      anchors.lights!,
      [],
      0.7,
      [0.16, 0.16],
      0.015,
    );
  }
  if (c.chimney ?? true)
    anchors.smoke!.push(chimneyPart(s, x0 + 0.3, vz, sh.top - 0.1, sh.ridge + 0.08, palette.brick));
  if (c.sign) signBoard(s, front, (x0 + x1) / 2, 0.58, 0.4, 0.015, anchors);
  return { s, anchors };
}

// --- Cheesemaker --------------------------------------------------------------------------------

function cheesemaker(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd } = streams(opts, 47);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.22;
  const x1 = w - 0.22;
  const z0 = 0.25;
  const z1 = d - 0.36;
  const material: RoofMaterial = c.roofMaterial ?? 'slate';
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.14,
    wallH: 0.82,
    wall: 'stone',
    wallColor: c.wall ?? vary(0xc2b8a2, rnd, 0.5),
    trim: palette.timber,
    roof: {
      shape: 'hip',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.62,
      overhang: 0.16,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  const accent = c.accent ?? palette.mustard;
  doorPart(s, front, doorU, 0.26, 0.6, accent, palette.timber, 'arched', 0.015);
  if (!plain) {
    // The maturing room: a wide shuttered window thrown open on shelves of wheels.
    const wu = doorU < w / 2 ? x1 - 0.42 : x0 + 0.42;
    faceBox(s, front, wu - 0.25, 0.36, -0.01, wu + 0.25, 0.72, 0.02, 0x3b3229);
    for (const y of [0.4, 0.55]) {
      faceBox(s, front, wu - 0.22, y - 0.01, 0.0, wu + 0.22, y, 0.06, vary(palette.wood, rnd, 0.5));
      for (let i = 0; i < 4; i++) {
        const p = facePoint(front, wu - 0.16 + i * 0.105, y, 0.03);
        cheeseWheel(s, p[0], p[1], p[2], 0.045, rnd);
      }
    }
    for (const side of [-1, 1])
      faceBox(s, front, wu + side * 0.25, 0.36, 0.0, wu + side * 0.25 + side * 0.18, 0.72, 0.03, accent);
    // Steps down to the cellar at the side, under a little hood.
    const sx = w - 0.13;
    for (let i = 0; i < 3; i++)
      s.box(
        sx - 0.1,
        0.12 - i * 0.04,
        z0 + 0.2 + i * 0.1,
        sx + 0.1,
        0.14 - i * 0.04,
        z0 + 0.3 + i * 0.1,
        palette.stone,
      );
    if (sx - 0.1 > x1) {
      faceBox(s, { dir: 'x+', plane: x1 }, z0 + 0.25, 0, 0, z0 + 0.55, 0.36, 0.02, 0x3b3229);
      faceBox(
        s,
        { dir: 'x+', plane: x1 },
        z0 + 0.27,
        0,
        0.02,
        z0 + 0.53,
        0.33,
        0.03,
        vary(palette.wood, rnd, 0.6),
      );
    }
    // A cheese press outside: a screw on a heavy frame over a mould.
    const px = doorU < w / 2 ? x0 + 0.1 : x1 - 0.1;
    const pz = z1 + 0.18;
    s.box(px - 0.12, 0, pz - 0.1, px + 0.12, 0.08, pz + 0.1, vary(palette.wood, rnd, 0.5));
    for (const dx of [-0.1, 0.1]) beam(s, [px + dx, 0.08, pz], [px + dx, 0.42, pz], 0.016, palette.timber);
    beam(s, [px - 0.12, 0.42, pz], [px + 0.12, 0.42, pz], 0.02, palette.timber);
    beam(s, [px, 0.12, pz], [px, 0.48, pz], 0.01, IRON);
    s.cylinder(px, pz, 0.07, 0.07, 0.08, 0.18, vary(palette.wood, rnd, 0.8), 8);
    hangingSign(
      s,
      front,
      doorU + 0.3 < x1 ? doorU + 0.3 : doorU - 0.3,
      0.84,
      vary(palette.paper, rnd, 0.3),
      (ss, ctr) => {
        for (const k of [-1, 1])
          ss.blob(ctr[0] + k * 0.02, ctr[1] - 0.01, ctr[2], 0.012, 0.04, 0.075, GOOD_COLORS.cheese, 0);
      },
    );
    windowPart(
      s,
      { dir: 'x-', plane: x0 },
      (z0 + z1) / 2,
      0.55,
      0.16,
      0.18,
      windowStyle(c, accent, { box: false, shutters: true }),
      rnd,
      anchors.lights,
      0.015,
    );
    milkChurn(s, doorU - 0.25, z1 + 0.12);
  }
  // A louvred vent on the hip for the curing air.
  const vx = (x0 + x1) / 2;
  const vz = (z0 + z1) / 2;
  s.box(vx - 0.1, sh.ridge - 0.08, vz - 0.1, vx + 0.1, sh.ridge + 0.08, vz + 0.1, palette.white);
  s.cylinder(vx, vz, 0.17, 0, sh.ridge + 0.08, sh.ridge + 0.2, vary(sh.roof.color, rnd, 0.4), 4, Math.PI / 4);
  pileOf(s, 'cheese', level(opts, 'out:cheese'), w / 2, 0, d - 0.15, rnd);
  if (c.sign) signBoard(s, front, doorU, 0.82, 0.4, 0.015, anchors);
  return { s, anchors };
}

// --- Orchard ------------------------------------------------------------------------------------

function orchard(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 48);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const season = seasonOf(opts);
  // Mown grass between the rows, a low stone wall or hedge round the edge.
  groundPatch(s, 0.06, 0.06, w - 0.06, d - 0.06, vary(0x8fb35a, rnd, 0.4), rnd);
  const gate = ex + 0.5;
  const wall = look() < 0.5;
  const edge = (a: [number, number], b: [number, number]): void =>
    wall ? postAndRail(s, a, b, rnd) : wattle(s, a, b, rnd);
  edge([0.05, 0.05], [w - 0.05, 0.05]);
  edge([0.05, 0.05], [0.05, d - 0.05]);
  edge([w - 0.05, 0.05], [w - 0.05, d - 0.05]);
  edge([0.05, d - 0.05], [gate - 0.2, d - 0.05]);
  edge([gate + 0.2, d - 0.05], [w - 0.05, d - 0.05]);
  // Trees in offset rows, one per tile or so, leaving the gate row's lane open.
  const cols = Math.max(2, Math.round(w * 0.95));
  const rows = Math.max(2, Math.round(d * 0.95));
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = 0.42 + ((w - 0.84) * (k + (r % 2) * 0.5)) / Math.max(1, cols - 0.5);
      const z = 0.42 + ((d - 1.1) * r) / Math.max(1, rows - 1);
      if (x > w - 0.3 || Math.abs(x - gate) < 0.25) continue;
      orchardTree(s, x, z, 0.92 + rnd() * 0.18, season, rnd, plain);
    }
  }
  if (!plain) {
    // A ladder in a tree, baskets under it, a picker's shed in the corner.
    ladder(s, [0.62, 0, 0.75], [0.48, 0.55, 0.62], [0.7, 0, -0.7]);
    if (season === 1 || season === 2) {
      for (let i = 0; i < 2; i++) {
        const bx = 0.75 + i * 0.16;
        const bz = 0.95;
        s.cylinder(bx, bz, 0.06, 0.07, 0, 0.08, vary(GOOD_COLORS.wicker, rnd, 0.5), 8);
        if (season === 2) s.blob(bx, 0.09, bz, 0.055, 0.03, 0.055, GOOD_COLORS.apple, 1);
      }
    }
    const sx = w - 0.42;
    const sz = d - 0.45;
    s.box(sx - 0.22, 0, sz - 0.18, sx + 0.22, 0.38, sz + 0.18, vary(0x8a6f58, rnd, 0.5));
    roofPart(s, {
      shape: 'lean',
      material: 'shingle',
      x0: sx - 0.28,
      z0: sz - 0.24,
      x1: sx + 0.28,
      z1: sz + 0.26,
      y0: 0.36,
      y1: 0.5,
      color: vary(0x7a6a5a, rnd, 0.4),
      trim: palette.timber,
      ridgeAlongX: true,
      rnd,
    });
    s.box(sx - 0.08, 0.02, sz + 0.18, sx + 0.08, 0.3, sz + 0.19, vary(palette.wood, rnd, 1.2));
  }
  pileOf(
    s,
    'apples',
    level(opts, 'out:apples'),
    gate + 0.55 < w - 0.3 ? gate + 0.55 : gate - 0.55,
    0,
    d - 0.3,
    rnd,
  );
  return { s, anchors };
}

// --- Cider press --------------------------------------------------------------------------------

/** An apple mill: a stone edge-runner wheel in a round stone trough with a sweep. */
function appleMill(s: ShapeBuilder, x: number, z: number, rnd: () => number): void {
  s.cylinder(x, z, 0.32, 0.34, 0, 0.16, vary(palette.stone, rnd, 0.6), 12);
  s.cylinder(x, z, 0.24, 0.24, 0.16, 0.162, vary(0xb5854a, rnd, 0.5), 12);
  s.cylinder(x, z, 0.06, 0.06, 0.16, 0.3, palette.stone, 8);
  cylX(s, x + 0.08, x + 0.2, 0.26, z, 0.12, vary(0xa39c90, rnd, 0.6), 10);
  beam(s, [x, 0.3, z], [x + 0.62, 0.3, z - 0.05], 0.02, vary(palette.wood, rnd, 0.5));
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    s.blob(x + Math.cos(a) * 0.18, 0.18, z + Math.sin(a) * 0.18, 0.025, 0.02, 0.025, palette.apple, 0);
  }
}

/** A twin-screw press: a heavy frame, a beam, two screws and the cheese of pomace in straw. */
function screwPress(s: ShapeBuilder, x: number, z: number, rnd: () => number): void {
  const wood = vary(0x7a5236, rnd, 0.4);
  s.box(x - 0.26, 0, z - 0.2, x + 0.26, 0.12, z + 0.2, wood);
  for (const dx of [-0.22, 0.22]) beam(s, [x + dx, 0.12, z], [x + dx, 0.66, z], 0.03, wood);
  s.box(x - 0.28, 0.6, z - 0.05, x + 0.28, 0.7, z + 0.05, wood);
  for (const dx of [-0.12, 0.12]) beam(s, [x + dx, 0.32, z], [x + dx, 0.72, z], 0.012, IRON);
  s.box(x - 0.2, 0.3, z - 0.15, x + 0.2, 0.36, z + 0.15, vary(wood, rnd, 0.6));
  for (let i = 0; i < 3; i++)
    s.box(
      x - 0.15,
      0.12 + i * 0.06,
      z - 0.13,
      x + 0.15,
      0.17 + i * 0.06,
      z + 0.13,
      i % 2 ? 0xdcbc6a : 0xb5854a,
    );
}

function ciderPress(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 49);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.18;
  const x1 = w - 0.18;
  const z0 = 0.18;
  const z1 = d - 1.05;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'thatch' : 'tile');
  shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.06,
    wallH: 0.8,
    wall: 'timber',
    wallColor: c.wall ?? vary(palette.plasterButter, rnd, 0.4),
    trim: palette.timber,
    roof: {
      shape: 'halfHip',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.62,
      overhang: 0.16,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.5, 0.6, c.accent ?? 0x7f9a52, palette.white, 'double', 0.015);
  // The press shed: an open lean-to across the front with the press inside, the mill outside.
  const pz = d - 0.4;
  for (const x of [x0 + 0.05, x1 - 0.05]) beam(s, [x, 0, pz], [x, 0.66, pz], 0.022, palette.timber);
  roofPart(s, {
    shape: 'lean',
    material: material === 'thatch' ? 'shingle' : material,
    x0: x0 - 0.06,
    z0: z1 - 0.02,
    x1: x1 + 0.06,
    z1: pz + 0.12,
    y0: 0.64,
    y1: 0.86,
    color: vary(material === 'thatch' ? 0x8a6f58 : roofColor(c, material), rnd, 0.4),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  if (!plain) {
    screwPress(s, doorU < w / 2 ? x1 - 0.42 : x0 + 0.42, (z1 + pz) / 2, rnd);
    appleMill(s, doorU < w / 2 ? x0 + 0.42 : x1 - 0.5, (z1 + pz) / 2 + 0.05, rnd);
    hangingSign(
      s,
      { dir: 'z+', plane: pz },
      doorU < w / 2 ? x1 - 0.02 : x0 + 0.02,
      0.62,
      vary(palette.paper, rnd, 0.3),
      (ss, ctr) => {
        for (const k of [-1, 1])
          ss.blob(ctr[0] + k * 0.02, ctr[1], ctr[2], 0.012, 0.05, 0.05, palette.apple, 1);
      },
    );
    windowRow(
      s,
      { dir: 'x+', plane: x1 },
      z0,
      z1,
      0.5,
      windowStyle(c, palette.white, { box: false, shutters: false }),
      rnd,
      anchors.lights!,
      [],
      0.7,
      [0.18, 0.18],
      0.015,
    );
    anchors.lights!.push(wallLantern(s, facePoint(front, doorU + 0.32, 0.62, 0.015), [0, 0, 1]));
  }
  pileOf(s, 'cider', Math.max(1, level(opts, 'out:cider')), x0 + 0.35, 0, d - 0.17, rnd);
  pileOf(s, 'apples', level(opts, 'in:apples'), x1 - 0.35, 0, d - 0.17, rnd);
  if (c.sign) signBoard(s, front, doorU, 0.74, 0.42, 0.015, anchors);
  return { s, anchors };
}

// --- Chopping shed ------------------------------------------------------------------------------

/** A round beehive woodstack (a holzhaufen): split logs in rings under a bark cap. */
function roundStack(s: ShapeBuilder, x: number, z: number, r: number, h: number, rnd: () => number): void {
  const rings = Math.max(3, Math.round(h / 0.06));
  for (let i = 0; i < rings; i++) {
    const y = i * (h / rings);
    const rr = r * (1 - (i / rings) * 0.25);
    const n = Math.max(8, Math.round(rr * 30));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (i % 2) * 0.12;
      const px = x + Math.cos(a) * rr;
      const pz = z + Math.sin(a) * rr;
      s.box(
        px - 0.03,
        y,
        pz - 0.03,
        px + 0.03,
        y + h / rings - 0.004,
        pz + 0.03,
        vary(i % 3 ? 0xd9b98a : 0xc9a46e, rnd, 0.6),
      );
    }
  }
  s.cylinder(x, z, r * 0.8, r * 0.75, 0, h, vary(0xc9a46e, rnd, 0.5), 10);
  s.cylinder(x, z, r * 0.85, 0.02, h, h + r * 0.55, vary(palette.bark, rnd, 0.4), 10);
}

function choppingShed(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const { rnd } = streams(opts, 50);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  groundPatch(s, 0.08, 0.08, w - 0.08, d - 0.08, vary(0xc0a27a, rnd, 0.4), rnd);
  // The log store: a roof on posts, its back and sides walled with stacked firewood.
  const x0 = 0.16;
  const x1 = w - 0.16;
  const z0 = 0.16;
  const z1 = d * 0.52;
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ] as const)
    beam(s, [x, 0, z], [x, 0.62, z], 0.022, palette.timber);
  const material: RoofMaterial = c.roofMaterial ?? 'shingle';
  roofPart(s, {
    shape: 'lean',
    material,
    x0: x0 - 0.1,
    z0: z0 - 0.1,
    x1: x1 + 0.1,
    z1: z1 + 0.16,
    y0: 0.58,
    y1: 0.8,
    color: vary(roofColor(c, material), rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  // The wall of firewood: a stack whose face shows the split ends in staggered rows.
  const lv = Math.max(1, level(opts, 'out:firewood'));
  const top = Math.min(0.56, 0.22 + lv * 0.09);
  s.box(x0 + 0.03, 0, z0 + 0.04, x1 - 0.03, top, z0 + 0.3, vary(palette.bark, rnd, 0.5));
  const rowsN = Math.round(top / 0.055);
  const face = z0 + 0.302;
  for (let row = 0; row < rowsN; row++) {
    const y = row * (top / rowsN);
    const n = Math.floor((x1 - x0 - 0.08) / 0.06);
    for (let i = 0; i < n; i++) {
      const x = x0 + 0.05 + i * 0.06 + (row % 2) * 0.03;
      if (x > x1 - 0.07) continue;
      const r = 0.024 + rnd() * 0.006;
      s.quad(
        [x, y + 0.006, face],
        [x + r * 2, y + 0.006, face],
        [x + r * 2, y + 0.048, face],
        [x, y + 0.048, face],
        vary(0xd9b98a, rnd, 0.9),
        [0, 0, 1],
      );
    }
  }
  if (!plain) {
    // A round stack in the yard, the chopping block, logs waiting and a sawhorse.
    roundStack(s, x1 - 0.32, d - 0.42, 0.26, 0.42, rnd);
    choppingBlock(s, x0 + 0.38, z1 + 0.36, rnd);
    sawhorse(s, x0 + 0.42, d - 0.3, true, rnd);
    pileOf(s, 'logs', Math.max(1, level(opts, 'in:logs')), (x0 + x1) / 2, 0, z0 + 0.62, rnd);
  }
  return { s, anchors };
}

// --- Herb garden --------------------------------------------------------------------------------

/** A straw bee skep on a little stand. */
function skep(s: ShapeBuilder, x: number, z: number, rnd: () => number): void {
  s.box(x - 0.09, 0.14, z - 0.09, x + 0.09, 0.16, z + 0.09, vary(palette.wood, rnd, 0.5));
  beam(s, [x, 0, z], [x, 0.14, z], 0.018, palette.timber);
  const rings = 4;
  for (let i = 0; i < rings; i++) {
    const y0 = 0.16 + i * 0.045;
    const r0 = 0.08 * Math.cos((i / rings) * 1.2);
    const r1 = 0.08 * Math.cos(((i + 1) / rings) * 1.2);
    s.cylinder(
      x,
      z,
      r0,
      i === rings - 1 ? 0.0 : r1,
      y0,
      y0 + 0.045,
      vary(0xd9b96a, rnd, i % 2 ? 0.4 : 0.9),
      8,
    );
  }
  s.box(x - 0.02, 0.165, z + 0.065, x + 0.02, 0.19, z + 0.075, 0x3b3229);
}

const HERB_BEDS = [GOOD_COLORS.lavender, 0x9fb08a, GOOD_COLORS.chamomile, 0x6f9a4a, 0xe08a3a, 0x8fbf6a];

function herbGarden(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 51);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const gate = ex + 0.5;
  groundPatch(s, 0.06, 0.06, w - 0.06, d - 0.06, vary(0xc9b48a, rnd, 0.4), rnd);
  wattle(s, [0.06, 0.06], [w - 0.06, 0.06], rnd);
  wattle(s, [0.06, 0.06], [0.06, d - 0.06], rnd);
  wattle(s, [w - 0.06, 0.06], [w - 0.06, d - 0.06], rnd);
  wattle(s, [0.06, d - 0.06], [gate - 0.18, d - 0.06], rnd);
  wattle(s, [gate + 0.18, d - 0.06], [w - 0.06, d - 0.06], rnd);
  // Raised beds either side of a gravel path, each a different herb in flower.
  const beds: [number, number, number, number][] = [];
  const bw = (w - 0.5) / 2;
  const rowsN = Math.max(2, Math.round((d - 0.6) / 0.55));
  const bd = (d - 0.55 - (rowsN - 1) * 0.12) / rowsN;
  for (let r = 0; r < rowsN; r++) {
    const z = 0.22 + r * (bd + 0.12);
    beds.push([0.18, z, 0.18 + bw, z + bd]);
    beds.push([w - 0.18 - bw, z, w - 0.18, z + bd]);
  }
  beds.forEach(([x0, z0, x1, z1], i) => {
    s.rbox(x0, 0, z0, x1, 0.07, z1, vary(palette.wood, rnd, 0.5), 0.01);
    s.box(x0 + 0.02, 0.07, z0 + 0.02, x1 - 0.02, 0.075, z1 - 0.02, palette.soil);
    const col = HERB_BEDS[(i + Math.floor(look() * HERB_BEDS.length)) % HERB_BEDS.length]!;
    const nx = Math.max(2, Math.round((x1 - x0) / 0.12));
    const nz = Math.max(1, Math.round((z1 - z0) / 0.12));
    if (plain) {
      s.box(
        x0 + 0.03,
        0.075,
        z0 + 0.03,
        x1 - 0.03,
        0.14,
        z1 - 0.03,
        vary(mixHex(0x6f9a4a, col, 0.35), rnd, 0.4),
      );
      return;
    }
    // Clumps in rows: a leafy mound each, flowering on top in the bed's color.
    for (let a = 0; a < nx; a++)
      for (let b = 0; b < nz; b++) {
        const px = x0 + ((x1 - x0) * (a + 0.5)) / nx;
        const pz = z0 + ((z1 - z0) * (b + 0.5)) / nz;
        s.blob(px, 0.115, pz, 0.06, 0.05, 0.06, vary(0x6f9a4a, rnd, 0.8), 0, rnd, 0.15, vary(col, rnd, 0.4));
      }
  });
  if (!plain) {
    // A drying rack of bunches, two skeps by the back fence and a sundial at the crossing.
    const rx = w - 0.3;
    const rz = d - 0.35;
    for (const dx of [-0.18, 0.18]) beam(s, [rx + dx, 0, rz], [rx + dx, 0.42, rz], 0.012, palette.timber);
    beam(s, [rx - 0.2, 0.4, rz], [rx + 0.2, 0.4, rz], 0.01, palette.timber);
    for (let i = 0; i < 5; i++) {
      const x = rx - 0.14 + i * 0.07;
      beam(s, [x, 0.4, rz], [x, 0.34, rz], 0.003, 0xbfa27a);
      s.blob(x, 0.29, rz, 0.02, 0.055, 0.02, vary(HERB_BEDS[i % HERB_BEDS.length]!, rnd, 0.5), 0);
    }
    skep(s, 0.3, 0.16, rnd);
    if (w > 2.4 || look() < 0.6) skep(s, 0.52, 0.16, rnd);
    s.cylinder(w / 2, (d - 0.2) / 2, 0.04, 0.05, 0, 0.18, palette.stone, 6);
    s.box(
      w / 2 - 0.06,
      0.18,
      (d - 0.2) / 2 - 0.06,
      w / 2 + 0.06,
      0.2,
      (d - 0.2) / 2 + 0.06,
      vary(palette.stone, rnd, 0.6),
    );
    beam(s, [w / 2, 0.2, (d - 0.2) / 2], [w / 2, 0.25, (d - 0.2) / 2 + 0.04], 0.004, IRON);
  }
  pileOf(s, 'herbs', level(opts, 'out:herbs'), 0.45, 0, d - 0.3, rnd);
  return { s, anchors };
}

// --- Smithy -------------------------------------------------------------------------------------

function anvil(s: ShapeBuilder, x: number, z: number): void {
  s.cylinder(x, z, 0.08, 0.07, 0, 0.14, palette.bark, 8);
  s.box(x - 0.06, 0.14, z - 0.035, x + 0.06, 0.18, z + 0.035, IRON);
  s.box(x - 0.09, 0.18, z - 0.04, x + 0.07, 0.22, z + 0.04, IRON);
  s.cylinder(x + 0.1, z, 0.03, 0.0, 0.18, 0.22, IRON, 4);
  beam(s, [x - 0.04, 0.23, z + 0.02], [x + 0.06, 0.25, z + 0.07], 0.008, palette.wood);
}

function smithy(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 52);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.2;
  const z1 = d - 1.05;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.6 ? 'slate' : 'tile');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: 1.0,
    wall: 'stone',
    wallColor: c.wall ?? vary(0xa9a191, rnd, 0.5),
    trim: palette.timber,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.56,
      overhang: 0.14,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  // The forge: the front of the shop open under a deep canopy; hearth and anvil in plain sight.
  const cz = d - 0.3;
  for (const x of [x0 + 0.04, x1 - 0.04]) beam(s, [x, 0, cz], [x, 0.8, cz], 0.026, palette.timber);
  roofPart(s, {
    shape: 'lean',
    material,
    x0: x0 - 0.06,
    z0: z1 - 0.02,
    x1: x1 + 0.06,
    z1: cz + 0.12,
    y0: 0.78,
    y1: 1.0,
    color: vary(sh.roof.color, rnd, 0.3),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  s.rbox(x0, 0, z1, x1, 0.02, cz, vary(0x6f665c, rnd, 0.4), 0.02);
  const hx = doorU < w / 2 ? x1 - 0.32 : x0 + 0.32;
  // The hearth: a brick block with a glowing bed of coals and a hood up into the big chimney.
  s.rbox(hx - 0.22, 0, z1 + 0.02, hx + 0.22, 0.3, z1 + 0.38, vary(palette.brick, rnd, 0.4), 0.02);
  s.glow(2);
  s.box(hx - 0.14, 0.3, z1 + 0.08, hx + 0.14, 0.32, z1 + 0.32, 0xff8a3a);
  s.glow(0);
  s.blob(hx, 0.33, z1 + 0.2, 0.08, 0.02, 0.06, 0xffc977, 0);
  s.cylinder(hx, z1 + 0.18, 0.2, 0.08, 0.5, 0.8, vary(palette.brick, rnd, 0.4), 4, Math.PI / 4);
  anchors.lights!.push([hx, 0.4, z1 + 0.25]);
  anchors.smoke!.push(chimneyPart(s, hx, z1 - 0.12, sh.top - 0.2, sh.ridge + 0.32, palette.brick, true));
  if (!plain) {
    anvil(s, (x0 + x1) / 2, z1 + 0.5);
    // Bellows beside the hearth, a quench tub, a rack of tongs, horseshoes nailed up.
    const bx = hx + (hx < w / 2 ? 0.32 : -0.32);
    s.blob(bx, 0.24, z1 + 0.2, 0.09, 0.05, 0.14, 0x6b4a30, 0);
    beam(s, [bx, 0.24, z1 + 0.34], [bx, 0.3, z1 + 0.5], 0.012, palette.wood);
    s.cylinder(hx, cz - 0.08, 0.09, 0.1, 0, 0.14, vary(palette.wood, rnd, 0.6), 8);
    s.cylinder(hx, cz - 0.08, 0.085, 0.085, 0.14, 0.142, palette.waterDeep, 8);
    for (let i = 0; i < 4; i++) {
      const p = facePoint(front, x0 + 0.2 + i * 0.12, 0.62, 0.02);
      s.box(p[0] - 0.03, p[1] - 0.04, p[2], p[0] + 0.03, p[1] + 0.02, p[2] + 0.01, IRON);
    }
    hangingSign(
      s,
      { dir: 'z+', plane: cz },
      doorU < w / 2 ? x0 + 0.02 : x1 - 0.02,
      0.64,
      vary(palette.paper, rnd, 0.3),
      (ss, ctr) => {
        for (const k of [-1, 1]) {
          ss.blob(ctr[0] + k * 0.02, ctr[1] - 0.02, ctr[2] - 0.035, 0.01, 0.045, 0.012, IRON, 0);
          ss.blob(ctr[0] + k * 0.02, ctr[1] - 0.02, ctr[2] + 0.035, 0.01, 0.045, 0.012, IRON, 0);
          ss.blob(ctr[0] + k * 0.02, ctr[1] + 0.03, ctr[2], 0.01, 0.012, 0.045, IRON, 0);
        }
      },
    );
    // A wheel waiting for its new tyre, iron bar stock against the wall.
    cylX(s, x1 + 0.02, x1 + 0.06, 0.17, (z0 + z1) / 2, 0.16, palette.darkWood, 10);
    cylX(s, x1 + 0.0, x1 + 0.08, 0.17, (z0 + z1) / 2, 0.04, IRON, 6);
    for (let i = 0; i < 4; i++)
      beam(s, [x0 - 0.05, 0, z0 + 0.3 + i * 0.03], [x0 - 0.02, 0.5, z0 + 0.32 + i * 0.03], 0.008, IRON);
    windowRow(
      s,
      { dir: 'x+', plane: x1 },
      z0,
      z1,
      0.5,
      windowStyle(c, palette.white, { box: false, shutters: false }),
      rnd,
      anchors.lights!,
      [],
      0.7,
      [0.16, 0.18],
      0.015,
    );
  }
  pileOf(s, 'tools', level(opts, 'out:tools'), doorU < w / 2 ? x0 + 0.3 : x1 - 0.3, 0, d - 0.15, rnd);
  if (c.sign) signBoard(s, front, (x0 + x1) / 2, 0.72, 0.42, 0.015, anchors);
  return { s, anchors };
}

export const brickKilnKit = villageKit('brick-kiln', [3, 3], [1, 2], brickKiln);
export const cheesemakerKit = villageKit('cheesemaker', [2, 2], [1, 1], cheesemaker);
export const choppingShedKit = villageKit('chopping-shed', [2, 2], [1, 1], choppingShed);
export const ciderPressKit = villageKit('cider-press', [2, 3], [1, 2], ciderPress);
export const clayPitKit = villageKit('clay-pit', [3, 3], [1, 2], clayPit);
export const dairyKit = villageKit('dairy', [3, 3], [1, 2], dairy);
export const herbGardenKit = villageKit('herb-garden', [2, 2], [1, 1], herbGarden);
export const orchardKit = villageKit('orchard', [3, 3], [1, 2], orchard);
export const sheepPastureKit = villageKit('sheep-pasture', [4, 4], [1, 3], sheepPasture);
export const smithyKit = villageKit('smithy', [2, 3], [1, 2], smithy);
export const spinnerKit = villageKit('spinner', [2, 2], [1, 1], spinner);
export const weaverKit = villageKit('weaver', [2, 3], [1, 2], weaver);
