// The I1 workplaces (docs/spec/13-ledger.md, I1 buildings), each with its own silhouette: the
// builder's yard and its gantry, the woodcutter's log cabin, the forester's nursery, the open
// sawpit, the terraced quarry, the gambrel barn of the farmhouse, the bakery's bow window and oven,
// the vegetable plot's beds, the fisher's jetty and boat, the storehouse yard and the market stall.
// Runtime detail arrives in params: 'out:<good>', 'in:<good>' and 'stock:<good>' levels 0 to 4
// and 'growth' 0 to 3, so piles and crops follow what the building is doing.
import { mixHex, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, cylZ, panel } from '../shapes';
import { shell, signBoard, windowRow, windowStyle, type Built } from './buildings';
import { crateOf, GOOD_COLORS, pileOf } from './goods';
import {
  awningPart,
  chimneyPart,
  claddingDepth,
  doorPart,
  dormerPart,
  faceBox,
  facePoint,
  hangingSign,
  porchPart,
  windowPart,
  type Face,
} from './parts';
import {
  barrel,
  bench,
  birdBox,
  choppingBlock,
  dryingRack,
  firewood,
  flowerPot,
  groundPatch,
  hayBale,
  ladder,
  milkChurn,
  netFrame,
  picket,
  rowboat,
  sapling,
  sawhorse,
  scarecrow,
  trap,
  wallLantern,
  wateringCan,
  wattle,
  weathervane,
} from './props';
import { roofPart, type RoofMaterial } from './roofs';
import { customOf, level, roofColor, streams } from './style';
import type { Kit, KitBuildOptions } from './types';

const EARTH = 0xb59a6e;
const GRAVEL = 0xa9a49a;

function kit(id: string, make: (o: KitBuildOptions | undefined) => Built): Kit {
  return {
    id,
    kind: 'building',
    build: (opts) => make(opts).s.build(),
    anchors: (opts) => make(opts).anchors,
  };
}

function start(): Built {
  return { s: new ShapeBuilder(), anchors: { smoke: [], lights: [] } };
}

/** A lantern on a post, always lit at night. Returns the flame position. */
function postLantern(s: ShapeBuilder, x: number, z: number, h = 0.62): V3 {
  beam(s, [x, 0, z], [x, h, z], 0.02, palette.timber);
  beam(s, [x, h - 0.02, z], [x + 0.12, h - 0.02, z], 0.012, palette.timber);
  s.box(x + 0.085, h - 0.17, z - 0.035, x + 0.155, h - 0.155, z + 0.035, palette.metal);
  s.glow(2);
  s.box(x + 0.092, h - 0.155, z - 0.028, x + 0.148, h - 0.08, z + 0.028, palette.lantern);
  s.glow(0);
  s.cylinder(x + 0.12, z, 0.05, 0, h - 0.08, h - 0.04, palette.metal, 4, Math.PI / 4);
  return [x + 0.12, h - 0.12, z];
}

// --- Bakery ---------------------------------------------------------------------------------------

function bakery(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, 1];
  const { rnd } = streams(opts, 11);
  const c = customOf(opts);
  const { s, anchors } = start();
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.32;
  const z1 = d - 0.3;
  const material = c.roofMaterial ?? 'tile';
  const accent = c.accent ?? palette.accentRed;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 0.84,
    wall: 'plaster',
    wallColor: c.wall ?? vary(palette.plasterButter, rnd, 0.4),
    trim: palette.timber,
    roof: {
      shape: 'halfHip',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.62,
      overhang: 0.18,
      ridgeAlongX: true,
    },
    rnd,
  });
  // A brick plinth course under the plaster.
  s.box(x0 - 0.012, 0.1, z0 - 0.012, x1 + 0.012, 0.24, z1 + 0.012, vary(palette.brick, rnd, 0.5));
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.28, 0.62, accent, palette.timber, 'dutch', 0.012);
  // The bow window: a shallow bay of warm, lit panes with loaves on the sill.
  const bu0 = x0 + 0.14;
  const bu1 = doorU - 0.3;
  const by0 = 0.26;
  const by1 = 0.7;
  const bd = 0.14;
  faceBox(s, front, bu0 - 0.03, by0 - 0.06, 0, bu1 + 0.03, by0, bd + 0.03, palette.timber);
  s.glow(2);
  faceBox(s, front, bu0, by0, bd - 0.02, bu1, by1, bd, 0xf1c178);
  for (const u of [bu0, bu1]) faceBox(s, front, u - 0.005, by0, 0, u + 0.005, by1, bd, 0xf1c178);
  s.glow(0);
  for (let i = 0; i <= 3; i++) {
    const u = bu0 + ((bu1 - bu0) * i) / 3;
    faceBox(s, front, u - 0.015, by0, bd - 0.01, u + 0.015, by1, bd + 0.012, palette.white);
  }
  faceBox(s, front, bu0 - 0.03, by1, 0, bu1 + 0.03, by1 + 0.05, bd + 0.04, palette.timber);
  const loaves = 1 + Math.min(4, Math.round(level(opts, 'out:bread')));
  for (let i = 0; i < loaves + 1; i++) {
    const u = bu0 + 0.08 + ((bu1 - bu0 - 0.16) * i) / Math.max(1, loaves);
    const p = facePoint(front, u, by0 + 0.02, bd + 0.045);
    s.blob(p[0], p[1], p[2], 0.045, 0.028, 0.03, vary(GOOD_COLORS.bread, rnd, 0.8), 1);
  }
  anchors.lights!.push(facePoint(front, (bu0 + bu1) / 2, (by0 + by1) / 2, bd + 0.05));
  awningPart(s, front, bu0 - 0.06, bu1 + 0.06, 0.86, 0.36, accent, palette.white, 5);
  // The sign: a golden loaf on a hanging board.
  const sign = hangingSign(s, front, doorU - 0.24, 0.98, vary(palette.paper, rnd, 0.3), (ss, ctr) => {
    for (const k of [-1, 1])
      ss.blob(ctr[0] + k * 0.022, ctr[1], ctr[2], 0.012, 0.045, 0.075, GOOD_COLORS.bread, 1);
  });
  anchors.sign = {
    center: [sign.center[0] + 0.02, sign.center[1], sign.center[2]],
    normal: [1, 0, 0],
    width: 0.24,
    height: 0.18,
  };
  windowPart(
    s,
    { dir: 'x+', plane: x1 },
    (z0 + z1) / 2,
    0.55,
    0.2,
    0.22,
    windowStyle(c, accent, { box: true, shutters: true }),
    rnd,
    anchors.lights,
  );
  windowPart(
    s,
    { dir: 'z-', plane: z0 },
    (x0 + x1) / 2 + 0.3,
    0.55,
    0.2,
    0.22,
    windowStyle(c, accent, { box: false, shutters: true }),
    rnd,
    anchors.lights,
  );
  // The bread oven: a brick dome on the side wall with its own flue, plus the main chimney.
  const ox = x0 - 0.22;
  const oz = (z0 + z1) / 2 - 0.15;
  s.rbox(ox - 0.06, 0, oz - 0.3, x0, 0.3, oz + 0.3, vary(palette.brick, rnd, 0.4), 0.03);
  s.blob(ox + 0.06, 0.3, oz, 0.2, 0.2, 0.26, vary(palette.brick, rnd, 0.6), 1);
  anchors.smoke!.push(chimneyPart(s, ox + 0.04, oz - 0.12, 0.3, 0.72, palette.brick));
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(s, x1 - 0.32, (z0 + z1) / 2 + 0.1, sh.top - 0.1, sh.ridge + 0.16, palette.brick, true),
    );
  // Out front: a bench with a bread basket, flour sacks by the side, a lantern by the door.
  bench(s, x1 - 0.05, z1 + 0.16, true, rnd);
  s.cylinder(x1 - 0.05, z1 + 0.16, 0.06, 0.07, 0.125, 0.17, 0xa8794a, 8);
  s.blob(x1 - 0.05, 0.18, z1 + 0.16, 0.05, 0.025, 0.04, GOOD_COLORS.bread, 1);
  const sacks = Math.max(1, Math.min(3, Math.round(level(opts, 'in:flour'))));
  for (let i = 0; i < sacks; i++)
    s.blob(
      x1 + 0.12,
      0.07 + (i === 2 ? 0.11 : 0),
      z0 + 0.25 + (i % 2) * 0.17,
      0.08,
      0.07,
      0.07,
      vary(GOOD_COLORS.sack, rnd, 0.5),
      1,
    );
  anchors.lights!.push(wallLantern(s, facePoint(front, doorU + 0.26, 0.74, 0.012), [0, 0, 1]));
  return { s, anchors };
}

// --- Farmhouse (barn) ---------------------------------------------------------------------------------

function farmhouse(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const { rnd, look } = streams(opts, 12);
  const c = customOf(opts);
  const { s, anchors } = start();
  const x0 = 0.22;
  const x1 = w - 0.22;
  const z0 = 0.22;
  const z1 = d - 0.32;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'shingle' : 'slate');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: 0.72,
    wall: 'weatherboard',
    wallColor: c.wall ?? vary(0xa8473b, rnd, 0.4),
    trim: palette.white,
    roof: {
      shape: 'gambrel',
      material,
      color: vary(roofColor(c, material, 0x6b625c), rnd, 0.5),
      rise: 0.95,
      overhang: 0.12,
      ridgeAlongX: false,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const mid = w / 2;
  doorPart(s, front, mid, 0.62, 0.6, c.accent ?? vary(0x8f3a30, rnd, 0.5), palette.white, 'double', 0.02);
  // Hayloft door with a hoist beam, a pulley and a rope.
  const loftY = sh.top + 0.18;
  faceBox(s, front, mid - 0.15, loftY - 0.16, 0.01, mid + 0.15, loftY + 0.14, 0.03, palette.white);
  faceBox(s, front, mid - 0.12, loftY - 0.13, 0.03, mid + 0.12, loftY + 0.11, 0.04, vary(0x6e4a2e, rnd, 0.5));
  beam(
    s,
    facePoint(front, mid, loftY + 0.26, -0.1),
    facePoint(front, mid, loftY + 0.26, 0.38),
    0.025,
    palette.timber,
  );
  beam(s, facePoint(front, mid, loftY + 0.24, 0.34), facePoint(front, mid, 0.5, 0.34), 0.004, 0xbfa27a);
  s.cylinder(mid, z1 + 0.34, 0.03, 0.03, loftY + 0.18, loftY + 0.22, palette.metal, 6);
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
    [0.16, 0.16],
    0.02,
  );
  windowRow(
    s,
    { dir: 'x-', plane: x0 },
    z0,
    z1,
    0.5,
    windowStyle(c, palette.white, { box: false, shutters: false }),
    rnd,
    anchors.lights!,
    [],
    0.7,
    [0.16, 0.16],
    0.02,
  );
  weathervane(s, mid, sh.ridge + 0.02, (z0 + z1) / 2);
  // Hay bales stacked by the side, a milk churn, a white picket run and wheat sheaves from the harvest.
  hayBale(s, x1 + 0.0, 0, z1 + 0.15, true, rnd);
  hayBale(s, x1 - 0.32, 0, z1 + 0.15, true, rnd);
  hayBale(s, x1 - 0.16, 0.14, z1 + 0.15, true, rnd);
  milkChurn(s, x0 + 0.08, z1 + 0.14);
  milkChurn(s, x0 + 0.19, z1 + 0.1);
  picket(s, [0.04, 0.1], [0.04, z1 - 0.05], palette.white);
  pileOf(s, 'wheat', level(opts, 'out:wheat'), x0 + 0.42, 0, z1 + 0.18, rnd);
  if (c.sign) signBoard(s, front, mid, sh.top + 0.02, 0.4, 0.03, anchors);
  return { s, anchors };
}

// --- Woodcutter's hut ----------------------------------------------------------------------------------

function woodcutter(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, 1];
  const { rnd } = streams(opts, 13);
  const c = customOf(opts);
  const { s, anchors } = start();
  groundPatch(s, 0.08, 1.05, w - 0.08, d - 0.05, 0xb5946a, rnd);
  for (let i = 0; i < 14; i++) {
    const x = 0.2 + rnd() * (w - 0.4);
    const z = 1.15 + rnd() * (d - 1.3);
    s.box(x - 0.015, 0.006, z - 0.01, x + 0.015, 0.012, z + 0.01, vary(0xe2c89a, rnd, 0.6));
  }
  const x0 = 0.3;
  const x1 = w - 0.2;
  const z0 = 0.18;
  const z1 = 1.1;
  const material = c.roofMaterial ?? 'shingle';
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.06,
    wallH: 0.66,
    wall: 'log',
    wallColor: palette.wood,
    trim: palette.timber,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material, 0x7d6a55), rnd, 0.5),
      rise: 0.48,
      overhang: 0.2,
      ridgeAlongX: true,
    },
    rnd,
  });
  // Moss creeping on the north slope.
  for (let i = 0; i < 4; i++) {
    const x = x0 + 0.15 + rnd() * (x1 - x0 - 0.3);
    s.blob(
      x,
      sh.top + 0.18 + rnd() * 0.12,
      z0 + 0.05 + rnd() * 0.15,
      0.08,
      0.025,
      0.06,
      vary(palette.roofMoss, rnd, 0.8),
      0,
    );
  }
  const clad = claddingDepth('log');
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.28, 0.56, c.accent ?? vary(0x6b4a30, rnd, 0.5), palette.timber, 'plank', clad);
  windowPart(
    s,
    front,
    x0 + 0.42,
    0.42,
    0.18,
    0.18,
    windowStyle(c, c.accent ?? palette.accentRed, { box: true, shutters: true }),
    rnd,
    anchors.lights,
    clad,
  );
  windowPart(
    s,
    { dir: 'x+', plane: x1 },
    (z0 + z1) / 2,
    0.42,
    0.16,
    0.16,
    windowStyle(c, palette.white, { box: false, shutters: false }),
    rnd,
    anchors.lights,
    clad,
  );
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(s, x0 + 0.2, (z0 + z1) / 2 + 0.12, sh.top - 0.1, sh.ridge + 0.14, vary(palette.stone, rnd)),
    );
  // A saw hanging on the wall.
  faceBox(s, front, doorU + 0.22, 0.4, clad, doorU + 0.5, 0.46, clad + 0.006, palette.metal);
  faceBox(s, front, doorU + 0.2, 0.39, clad, doorU + 0.25, 0.47, clad + 0.012, palette.wood);
  // The yard: logs waiting (more as the output fills), the chopping block and stacked firewood.
  pileOf(s, 'logs', Math.max(1, level(opts, 'out:logs')), 0.5, 0, 1.58, rnd);
  choppingBlock(s, 1.12, 1.62, rnd);
  firewood(s, 0.16, 0.66, false, 3, rnd);
  sawhorse(s, w - 0.24, 1.6, false, rnd);
  cylX(s, w - 0.42, w - 0.05, 0.25, 1.6, 0.05, vary(palette.bark, rnd), 6, 0xd9b98a);
  if (c.sign) signBoard(s, front, doorU, 0.76, 0.36, clad, anchors);
  return { s, anchors };
}

// --- Forester's lodge ---------------------------------------------------------------------------------

function forester(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, 1];
  const { rnd } = streams(opts, 14);
  const c = customOf(opts);
  const { s, anchors } = start();
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.2;
  const z1 = 1.15;
  const material = c.roofMaterial ?? 'slate';
  const green = c.accent ?? 0x4f7a43;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 0.74,
    wall: 'timber',
    wallColor: c.wall ?? vary(palette.plasterCream, rnd, 0.4),
    trim: vary(palette.timber, rnd, 0.3),
    roof: {
      shape: 'halfHip',
      material,
      color: vary(roofColor(c, material, 0x55625a), rnd, 0.5),
      rise: 0.78,
      overhang: 0.2,
      ridgeAlongX: true,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.28, 0.62, green, palette.timber, 'arched', 0.012);
  porchPart(s, front, doorU, 0.36, 0.8, 0.3, vary(sh.roof.color, rnd, 0.4), palette.timber, true);
  const style = windowStyle(c, green, { box: true, shutters: true });
  windowPart(s, front, x0 + 0.4, 0.5, 0.2, 0.22, style, rnd, anchors.lights, 0.012);
  windowPart(
    s,
    { dir: 'x-', plane: x0 },
    (z0 + z1) / 2,
    0.5,
    0.18,
    0.2,
    { ...style, box: false },
    rnd,
    anchors.lights,
    0.012,
  );
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(s, x1 - 0.3, (z0 + z1) / 2 - 0.1, sh.top - 0.1, sh.ridge + 0.1, vary(palette.stone, rnd)),
    );
  // The nursery: two raised beds of saplings in rows, a watering can and a bird box.
  for (const [bx0, bx1, bz] of [
    [0.12, 1.12, 1.42],
    [0.12, 1.12, 1.78],
  ] as const) {
    s.rbox(bx0, 0, bz - 0.13, bx1, 0.07, bz + 0.13, vary(palette.wood, rnd, 0.5), 0.01);
    s.box(bx0 + 0.03, 0.06, bz - 0.1, bx1 - 0.03, 0.075, bz + 0.1, palette.soil);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = bx0 + 0.1 + ((bx1 - bx0 - 0.2) * i) / (n - 1);
      for (const dz of [-0.05, 0.05])
        sapling(s, x, bz + dz, 0.16 + rnd() * 0.08, rnd, (i + (bz > 1.6 ? 1 : 0)) % 2 === 0);
    }
  }
  wateringCan(s, 1.28, 0, 1.55);
  birdBox(s, w - 0.15, d - 0.25, green);
  for (let i = 0; i < 3; i++)
    s.cylinder(
      1.3 + i * 0.02,
      1.85 - i * 0.03,
      0.045,
      0.055,
      i * 0.04,
      i * 0.04 + 0.07,
      vary(palette.roofTerracotta, rnd, 0.5),
      6,
    );
  if (c.sign) signBoard(s, front, doorU, 0.84, 0.36, 0.012, anchors);
  return { s, anchors };
}

// --- Sawpit -------------------------------------------------------------------------------------------

function sawpit(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const { rnd } = streams(opts, 15);
  const c = customOf(opts);
  const { s, anchors } = start();
  groundPatch(s, 0.08, 0.1, w - 0.08, d - 0.08, 0xc2a57a, rnd);
  // The pit, with a timber rim.
  const px0 = 0.62;
  const px1 = 1.38;
  const pz0 = 0.55;
  const pz1 = 2.15;
  s.box(px0, 0, pz0, px1, 0.008, pz1, 0x3a2a1e);
  s.box(px0 + 0.05, 0, pz0 + 0.05, px1 - 0.05, 0.01, pz1 - 0.05, 0x2a1f17);
  beam(s, [px0, 0.03, pz0], [px1, 0.03, pz0], 0.03, palette.timber);
  beam(s, [px0, 0.03, pz1], [px1, 0.03, pz1], 0.03, palette.timber);
  beam(s, [px0, 0.03, pz0], [px0, 0.03, pz1], 0.03, palette.timber);
  beam(s, [px1, 0.03, pz0], [px1, 0.03, pz1], 0.03, palette.timber);
  // A log across trestles over the pit with the long pit saw standing in its cut.
  for (const z of [0.85, 1.85]) {
    beam(s, [px0 - 0.05, 0.16, z], [px1 + 0.05, 0.16, z], 0.03, palette.timber);
  }
  cylZ(s, 0.65, 2.05, 1.0, 0.25, 0.085, vary(palette.bark, rnd, 0.5), 8, 0xd9b98a);
  s.box(0.995, 0.06, 1.38, 1.005, 0.6, 1.5, palette.metal);
  beam(s, [0.94, 0.6, 1.44], [1.06, 0.6, 1.44], 0.012, palette.wood);
  beam(s, [0.94, 0.07, 1.44], [1.06, 0.07, 1.44], 0.012, palette.wood);
  // The open shelter: six posts and a gable roof.
  const material = c.roofMaterial ?? 'shingle';
  const roofY = 0.95;
  for (const x of [0.32, w - 0.32])
    for (const z of [0.45, 1.35, 2.25]) {
      beam(s, [x, 0, z], [x, roofY, z], 0.032, palette.timber);
      beam(s, [x, roofY - 0.25, z], [x, roofY - 0.02, z + (z < 1 ? 0.22 : -0.22)], 0.016, palette.timber);
    }
  for (const x of [0.32, w - 0.32]) beam(s, [x, roofY, 0.4], [x, roofY, 2.3], 0.03, palette.timber);
  roofPart(s, {
    shape: 'gable',
    material,
    x0: 0.12,
    z0: 0.3,
    x1: w - 0.12,
    z1: 2.4,
    y0: roofY - 0.02,
    y1: roofY + 0.48,
    color: vary(roofColor(c, material, 0x8a6f58), rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: false,
    rnd,
  });
  // Planks out front (more as the output fills), logs waiting at the back, a sawdust heap.
  pileOf(s, 'planks', Math.max(1, level(opts, 'out:planks')), 1.0, 0, 2.62, rnd);
  pileOf(s, 'logs', Math.max(1, level(opts, 'in:logs')), 1.0, 0, 0.3, rnd);
  s.blob(1.55, 0.0, 1.0, 0.18, 0.08, 0.16, 0xe6cf9f, 1);
  s.blob(1.6, 0.0, 1.25, 0.1, 0.05, 0.09, 0xead8ad, 0);
  bench(s, 0.22, 1.2, false, rnd);
  if (c.sign) signBoard(s, { dir: 'z+', plane: 2.6 }, w / 2, roofY - 0.1, 0.5, 0.04, anchors);
  return { s, anchors };
}

// --- Quarry -------------------------------------------------------------------------------------------

function quarry(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const { rnd } = streams(opts, 16);
  const c = customOf(opts);
  const { s, anchors } = start();
  groundPatch(s, 0.05, 0.05, w - 0.05, d - 0.05, GRAVEL, rnd);
  // Cut terraces stepping up toward the back, faced with fresh pale cuts and darker weathered rock.
  const terraces: [number, number, number, number][] = [
    [0.05, 0.05, 2.0, 0.78],
    [0.05, 0.05, 1.45, 1.25],
    [0.05, 0.05, 0.9, 1.7],
  ];
  terraces.forEach(([tx0, tz0, tx1, tz1], i) => {
    const h = 0.78 - i * 0.24;
    const y0 = 0;
    const n = Math.round((tx1 - tx0) / 0.32);
    for (let k = 0; k < n; k++) {
      const bx0 = tx0 + ((tx1 - tx0) * k) / n;
      const bx1 = tx0 + ((tx1 - tx0) * (k + 1)) / n;
      const hh = h - (k % 2) * 0.04 - rnd() * 0.03;
      const col = vary(i === 0 ? 0x8f8a80 : k % 2 ? 0xb9b1a3 : 0xc8c0b0, rnd, 1.2);
      s.rbox(bx0 + 0.005, y0, tz0, bx1 - 0.005, hh, tz1 - (k % 3) * 0.03, col, 0.025);
    }
  });
  for (let i = 0; i < 6; i++) {
    const x = 2.1 + rnd() * 0.7;
    const z = 0.15 + rnd() * 0.6;
    s.rbox(x - 0.1, 0, z - 0.08, x + 0.1, 0.12 + rnd() * 0.15, z + 0.08, vary(palette.rock, rnd, 1.4), 0.03);
  }
  // A wooden derrick: mast, boom out over the terraces, rope and a hanging block, with a windlass.
  const mx = 2.35;
  const mz = 1.55;
  beam(s, [mx, 0, mz], [mx, 1.45, mz], 0.035, palette.timber);
  beam(s, [mx - 0.3, 0, mz + 0.3], [mx, 1.1, mz], 0.02, palette.timber);
  beam(s, [mx + 0.3, 0, mz + 0.3], [mx, 1.1, mz], 0.02, palette.timber);
  beam(s, [mx, 0.35, mz], [1.25, 1.35, 1.0], 0.028, palette.wood);
  beam(s, [mx, 1.45, mz], [1.25, 1.35, 1.0], 0.006, 0xbfa27a);
  beam(s, [1.25, 1.33, 1.0], [1.25, 0.72, 1.0], 0.005, 0xbfa27a);
  s.rbox(1.15, 0.52, 0.92, 1.35, 0.7, 1.08, vary(palette.stone, rnd, 0.8), 0.015);
  cylX(s, mx + 0.06, mx + 0.1, 0.3, mz + 0.25, 0.2, palette.wood, 10);
  cylX(s, mx + 0.03, mx + 0.13, 0.3, mz + 0.25, 0.04, palette.timber, 6);
  ladder(s, [0.7, 0, 1.95], [0.7, 0.52, 1.72], [1, 0, 0]);
  // Cut blocks waiting to go (more as the output fills), a pick leaning on them, a handcart.
  pileOf(s, 'stone', Math.max(1, level(opts, 'out:stone')), 0.6, 0, 2.5, rnd);
  beam(s, [0.95, 0, 2.45], [1.0, 0.32, 2.55], 0.01, palette.wood);
  s.box(0.93, 0.3, 2.53, 1.07, 0.33, 2.57, palette.metal);
  const cx = 2.3;
  const cz = 2.5;
  s.rbox(cx - 0.18, 0.12, cz - 0.24, cx + 0.18, 0.18, cz + 0.2, vary(palette.wood, rnd, 0.5), 0.01);
  for (const x of [cx - 0.22, cx + 0.22]) cylX(s, x - 0.02, x + 0.02, 0.11, cz, 0.11, palette.darkWood, 10);
  pileOf(s, 'stone', 1, cx, 0.18, cz, rnd);
  if (c.sign) signBoard(s, { dir: 'z+', plane: 2.0 }, 2.35, 0.75, 0.4, 0.04, anchors);
  return { s, anchors };
}

// --- Vegetable plot ---------------------------------------------------------------------------------------

/** Bed colors for thin, sandy soil and rich, dark loam. */
const THIN_SOIL = 0xb59a72;
const RICH_SOIL = 0x4a3222;

function vegetablePlot(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, 1];
  const { rnd } = streams(opts, 17);
  const c = customOf(opts);
  const { s, anchors } = start();
  const growth = Math.max(0, Math.min(3, Math.round(level(opts, 'growth'))));
  // Playtest round six: the soil shows. 'soil' 1 (thin) to 4 (rich); absent reads as good soil.
  const soil = Math.max(1, Math.min(4, Math.round(level(opts, 'soil')) || 3));
  const bed = mixHex(THIN_SOIL, RICH_SOIL, (soil - 1) / 3);
  const lush = 0.7 + soil * 0.1;
  // Wattle fence around, with a gap at the gate.
  const gate = ex + 0.5;
  wattle(s, [0.08, 0.08], [w - 0.08, 0.08], rnd);
  wattle(s, [0.08, 0.08], [0.08, d - 0.08], rnd);
  wattle(s, [w - 0.08, 0.08], [w - 0.08, d - 0.08], rnd);
  wattle(s, [0.08, d - 0.08], [gate - 0.22, d - 0.08], rnd);
  wattle(s, [gate + 0.22, d - 0.08], [w - 0.08, d - 0.08], rnd);
  // Three mounded rows: cabbages, carrots and pumpkins, by growth stage.
  const rows = [0.42, 0.88, 1.34];
  rows.forEach((z, r) => {
    s.rbox(0.22, 0, z - 0.14, w - 0.22, 0.06, z + 0.14, vary(bed, rnd, 0.4), 0.04);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = 0.36 + ((w - 0.72) * i) / (n - 1);
      const k = (0.85 + rnd() * 0.3) * lush;
      if (growth === 0) {
        if ((i + r) % 2 === 0) s.blob(x, 0.07, z, 0.018, 0.02, 0.018, palette.birchLeaf, 0);
        continue;
      }
      const g = growth / 3;
      if (r === 0) {
        s.blob(
          x,
          0.07,
          z,
          0.06 * g * k + 0.02,
          0.04 * g * k + 0.015,
          0.06 * g * k + 0.02,
          vary(0x7fae4e, rnd, 0.8),
          growth >= 2 ? 1 : 0,
        );
        if (growth === 3) s.blob(x, 0.1, z, 0.04 * k, 0.035, 0.04 * k, 0xa9d07a, 0);
      } else if (r === 1) {
        for (const dz of [-0.05, 0.05])
          s.cylinder(
            x + dz * 0.4,
            z + dz,
            0.03 * g + 0.01,
            0,
            0.06,
            0.08 + 0.1 * g * k,
            vary(0x5f9a3e, rnd, 0.8),
            4,
          );
        if (growth === 3) s.cylinder(x, z, 0.022, 0.03, 0.04, 0.07, 0xe2803a, 6);
      } else {
        s.blob(x, 0.07, z, 0.07 * g, 0.02 + 0.02 * g, 0.07 * g, vary(0x6f9a46, rnd, 0.8), 0);
        if (growth >= 2 && i % 2 === 0)
          s.blob(
            x + 0.04,
            0.08,
            z + 0.03,
            0.05 * g * k,
            0.04 * g * k,
            0.05 * g * k,
            growth === 3 ? 0xe08a2e : 0x9fb050,
            1,
          );
      }
    }
  });
  scarecrow(s, w - 0.3, 0.3, c.accent ?? vary(palette.navy, rnd, 0.5));
  wateringCan(s, gate - 0.32, 0, d - 0.25);
  // A trug of the day's picking by the gate when there is some.
  if (level(opts, 'out:vegetables') > 0) {
    s.cylinder(gate + 0.34, d - 0.3, 0.07, 0.08, 0, 0.06, 0xa8794a, 8);
    s.blob(gate + 0.32, 0.07, d - 0.3, 0.04, 0.035, 0.04, 0x7fae4e, 0);
    s.blob(gate + 0.37, 0.07, d - 0.32, 0.03, 0.03, 0.03, 0x9c3a4f, 0);
  }
  if (c.sign) signBoard(s, { dir: 'z+', plane: d - 0.06 }, gate + 0.45, 0.32, 0.3, 0.01, anchors);
  return { s, anchors };
}

// --- Fisher's hut -------------------------------------------------------------------------------------------

function fishersHut(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, 1];
  const { rnd } = streams(opts, 18);
  const c = customOf(opts);
  const { s, anchors } = start();
  const x0 = 0.18;
  const x1 = 1.55;
  const z0 = 0.15;
  const z1 = 1.0;
  const material = c.roofMaterial ?? 'shingle';
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.06,
    wallH: 0.64,
    wall: 'weatherboard',
    wallColor: c.wall ?? vary(0x6f8fa3, rnd, 0.4),
    trim: palette.white,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material, 0x6b625c), rnd, 0.5),
      rise: 0.5,
      overhang: 0.15,
      ridgeAlongX: true,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = Math.min(x1 - 0.25, ex + 0.3);
  doorPart(s, front, doorU, 0.26, 0.54, c.accent ?? palette.mustard, palette.white, 'plank', 0.02);
  windowPart(
    s,
    front,
    x0 + 0.35,
    0.42,
    0.18,
    0.18,
    windowStyle(c, c.accent ?? palette.mustard, { box: false, shutters: true }),
    rnd,
    anchors.lights,
    0.02,
  );
  // A tin stovepipe with a little hat.
  const px = x0 + 0.25;
  const pz = z0 + 0.25;
  s.cylinder(px, pz, 0.035, 0.035, sh.top, sh.ridge + 0.18, palette.metal, 6);
  s.cylinder(px, pz, 0.07, 0, sh.ridge + 0.2, sh.ridge + 0.26, palette.metal, 6);
  anchors.smoke!.push([px, sh.ridge + 0.28, pz]);
  // The jetty out to the water, the boat pulled up beside it, racks of fish and a net.
  const jx0 = doorU - 0.22;
  const jx1 = doorU + 0.22;
  for (let z = z1 + 0.02; z < d + 0.12; z += 0.11)
    s.box(jx0, 0.06, z, jx1, 0.085, z + 0.1, vary(palette.wood, rnd, 0.8));
  for (const x of [jx0 + 0.02, jx1 - 0.02]) {
    for (const z of [z1 + 0.5, d + 0.05]) beam(s, [x, -0.15, z], [x, 0.18, z], 0.02, palette.timber);
  }
  barrel(s, jx1 - 0.08, 0.085, d - 0.32, rnd, 0.8);
  anchors.lights!.push(postLantern(s, jx0 + 0.02, d + 0.05, 0.6));
  rowboat(s, 0.5, 0, 1.55, false, c.accent ?? vary(palette.teal, rnd, 0.5), rnd);
  const fish = 2 + Math.min(4, Math.round(level(opts, 'out:fish')));
  dryingRack(s, w - 0.2, 0.62, false, fish, rnd);
  netFrame(s, x0 + 0.1, z0 - 0.02, true);
  trap(s, x1 + 0.15, z1 + 0.15, true);
  trap(s, x1 + 0.2, z1 + 0.35, false);
  if (c.sign) signBoard(s, front, doorU, 0.68, 0.32, 0.02, anchors);
  return { s, anchors };
}

// --- Storehouse ------------------------------------------------------------------------------------------

const STORE_YARD: [good: string, x: number, z: number][] = [
  ['logs', 0.6, 2.25],
  ['planks', 0.6, 2.72],
  ['stone', 2.4, 2.25],
  ['flour', 2.4, 2.72],
];
const STORE_CRATES: [good: string, x: number][] = [
  ['bread', 0.55],
  ['vegetables', 0.85],
  ['fish', 2.15],
  ['wheat', 2.45],
];

function storehouse(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, 2];
  const { rnd, look } = streams(opts, 19);
  const c = customOf(opts);
  const { s, anchors } = start();
  groundPatch(s, 0.08, 1.85, w - 0.08, d - 0.06, EARTH, rnd);
  const x0 = 0.18;
  const x1 = w - 0.18;
  const z0 = 0.15;
  const z1 = 1.82;
  const material = c.roofMaterial ?? (look() < 0.5 ? 'tile' : 'slate');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.12,
    wallH: 1.3,
    wall: 'stone',
    wallColor: vary(palette.stone, rnd, 0.6),
    trim: palette.timber,
    upper: { at: 0.62, wall: 'weatherboard', color: c.wall ?? vary(0x9a6b43, rnd, 0.4), jetty: 0.02 },
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.78,
      overhang: 0.16,
      ridgeAlongX: true,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.62, 0.66, c.accent ?? vary(0x6e8a5a, rnd, 0.4), palette.white, 'double', 0.015);
  // A loading platform in front of the doors.
  s.rbox(doorU - 0.48, 0, z1, doorU + 0.48, 0.1, z1 + 0.28, vary(palette.wood, rnd, 0.5), 0.01);
  // The lucam: a little gabled hoist housing with a beam, a rope and a hanging crate.
  dormerPart(
    s,
    { dir: 'z+', plane: z1 + 0.02 },
    doorU,
    sh.top - 0.42,
    0.4,
    vary(0x9a6b43, rnd, 0.4),
    sh.roof.color,
    palette.timber,
    rnd,
    anchors.lights,
  );
  beam(
    s,
    facePoint(front, doorU, sh.top + 0.02, 0),
    facePoint(front, doorU, sh.top + 0.02, 0.45),
    0.025,
    palette.timber,
  );
  beam(s, facePoint(front, doorU, sh.top, 0.42), facePoint(front, doorU, 0.92, 0.42), 0.004, 0xbfa27a);
  crateOf(s, 'vegetables', doorU, 0.8, z1 + 0.42, rnd);
  const style = windowStyle(c, palette.white, { box: false, shutters: true });
  windowRow(
    s,
    { dir: 'z+', plane: sh.outer[3] },
    x0,
    x1,
    1.05,
    style,
    rnd,
    anchors.lights!,
    [doorU],
    0.75,
    [0.18, 0.2],
    0.02,
  );
  windowRow(
    s,
    { dir: 'x+', plane: sh.outer[2] },
    z0,
    z1,
    1.05,
    style,
    rnd,
    anchors.lights!,
    [],
    0.9,
    [0.18, 0.2],
    0.02,
  );
  windowRow(
    s,
    { dir: 'x-', plane: sh.outer[0] },
    z0,
    z1,
    1.05,
    style,
    rnd,
    anchors.lights!,
    [],
    0.9,
    [0.18, 0.2],
    0.02,
  );
  anchors.lights!.push(wallLantern(s, facePoint(front, doorU - 0.44, 0.8, 0.015), [0, 0, 1]));
  // The yard: piles that grow with what the town has in store.
  for (const [good, x, z] of STORE_YARD) pileOf(s, good, level(opts, `stock:${good}`), x, 0, z, rnd);
  for (const [good, x] of STORE_CRATES) {
    const lv = level(opts, `stock:${good}`);
    if (lv > 0) crateOf(s, good, x, 0, z1 + 0.14, rnd);
    if (lv > 2) crateOf(s, good, x, 0.12, z1 + 0.14, rnd);
  }
  if (c.sign) signBoard(s, front, doorU, 0.88, 0.5, 0.015, anchors);
  return { s, anchors };
}

// --- Market stall ----------------------------------------------------------------------------------------

const STALL_GOODS = ['bread', 'vegetables', 'fish', 'flour', 'wheat'];

function marketStall(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [1, 2];
  const { rnd, look } = streams(opts, 20);
  const c = customOf(opts);
  const { s, anchors } = start();
  const accent =
    c.accent ?? [palette.accentRed, palette.teal, palette.navy, palette.mustard][Math.floor(look() * 4)]!;
  const x0 = 0.1;
  const x1 = w - 0.1;
  const z0 = 0.2;
  const z1 = d - 0.22;
  // Posts: taller at the back so the awning slopes toward the customers.
  const back = 1.05;
  const frontH = 0.86;
  for (const [x, z, h] of [
    [x0, z0, back],
    [x1, z0, back],
    [x0, z1, frontH],
    [x1, z1, frontH],
  ] as const)
    beam(s, [x, 0, z], [x, h, z], 0.025, palette.timber);
  // Awning in stripes with a scalloped edge.
  const n = 6;
  for (let i = 0; i < n; i++) {
    const xa = x0 - 0.06 + ((x1 - x0 + 0.12) * i) / n;
    const xb = x0 - 0.06 + ((x1 - x0 + 0.12) * (i + 1)) / n;
    const hex = i % 2 === 0 ? accent : palette.white;
    panel(
      s,
      [xa, back + 0.02, z0 - 0.08],
      [xb, back + 0.02, z0 - 0.08],
      [xb, frontH + 0.02, z1 + 0.14],
      [xa, frontH + 0.02, z1 + 0.14],
      hex,
      vary(hex, rnd, 1.5),
    );
    panel(
      s,
      [xa, frontH + 0.02, z1 + 0.14],
      [xb, frontH + 0.02, z1 + 0.14],
      [(xa + xb) / 2, frontH - 0.07, z1 + 0.15],
      [(xa + xb) / 2, frontH - 0.07, z1 + 0.15],
      hex,
    );
  }
  // The counter with a cloth and the goods on show, then crates and a barrel behind.
  const cz0 = z1 - 0.3;
  const cz1 = z1 + 0.02;
  s.rbox(x0 + 0.02, 0, cz0, x1 - 0.02, 0.36, cz1, vary(palette.wood, rnd, 0.5), 0.015);
  s.box(x0 + 0.01, 0.3, cz1, x1 - 0.01, 0.37, cz1 + 0.012, vary(accent, rnd, 0.5));
  s.box(x0, 0.36, cz0 - 0.01, x1, 0.38, cz1 + 0.01, palette.white);
  const shown = STALL_GOODS.map((g) => [g, level(opts, `stock:${g}`)] as const).filter(([, lv]) => lv > 0);
  const display = shown.length > 0 ? shown.slice(0, 3) : ([['vegetables', 1]] as const);
  display.forEach(([good, lv], i) => {
    const x = x0 + 0.18 + i * ((x1 - x0 - 0.36) / Math.max(1, display.length - 1 || 1));
    const z = (cz0 + cz1) / 2;
    // A shallow basket, filled by how much is left.
    s.cylinder(x, z, 0.09, 0.11, 0.38, 0.43, 0xa8794a, 8);
    const k = Math.min(4, lv);
    for (let j = 0; j < k + 1; j++) {
      const a = (j / (k + 1)) * Math.PI * 2;
      const r = j === 0 ? 0 : 0.05;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (good === 'bread') s.blob(px, 0.45, pz, 0.045, 0.026, 0.03, vary(GOOD_COLORS.bread, rnd, 0.6), 1);
      else if (good === 'fish') s.blob(px, 0.44, pz, 0.06, 0.014, 0.02, vary(GOOD_COLORS.fish, rnd, 0.5), 0);
      else if (good === 'flour' || good === 'wheat')
        s.blob(px, 0.46, pz, 0.04, 0.035, 0.035, good === 'flour' ? GOOD_COLORS.sack : GOOD_COLORS.wheat, 1);
      else s.blob(px, 0.45, pz, 0.035, 0.03, 0.035, [0x7fae4e, 0xe2803a, 0x9c3a4f][j % 3]!, 0);
    }
  });
  crateOf(s, display[0]![0], x0 + 0.2, 0, z0 + 0.2, rnd);
  barrel(s, x1 - 0.16, 0, z0 + 0.22, rnd, 0.9);
  // A chalkboard at the front corner.
  const bx = x1 + 0.02;
  const bz = z1 + 0.28;
  beam(s, [bx - 0.08, 0, bz + 0.05], [bx, 0.34, bz], 0.008, palette.wood);
  beam(s, [bx + 0.08, 0, bz + 0.05], [bx, 0.34, bz], 0.008, palette.wood);
  s.box(bx - 0.1, 0.12, bz + 0.025, bx + 0.1, 0.3, bz + 0.035, palette.timber);
  s.box(bx - 0.085, 0.135, bz + 0.035, bx + 0.085, 0.285, bz + 0.04, 0x2f3a33);
  for (const [y, l] of [
    [0.25, 0.12],
    [0.21, 0.08],
    [0.17, 0.1],
  ] as const)
    s.box(bx - l / 2, y - 0.006, bz + 0.04, bx + l / 2, y + 0.006, bz + 0.043, palette.white);
  flowerPot(s, x0 - 0.02, 0, z1 + 0.18, rnd);
  if (c.sign) {
    s.box(x0, frontH - 0.02, z1 + 0.15, x1, frontH + 0.0, z1 + 0.17, palette.timber);
    anchors.sign = {
      center: [(x0 + x1) / 2, frontH - 0.12, z1 + 0.175],
      normal: [0, 0, 1],
      width: x1 - x0 - 0.1,
      height: 0.13,
    };
    s.box(x0 + 0.03, frontH - 0.2, z1 + 0.15, x1 - 0.03, frontH - 0.04, z1 + 0.17, palette.paper);
  }
  return { s, anchors };
}

// --- Builder's yard ------------------------------------------------------------------------------------------

function buildersYard(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const { rnd } = streams(opts, 21);
  const c = customOf(opts);
  const { s, anchors } = start();
  groundPatch(s, 0.06, 0.95, w - 0.06, d - 0.06, EARTH, rnd);
  // The workshop: an open-fronted lean-to along the back, with a workbench and tools.
  const x0 = 0.12;
  const x1 = w - 0.12;
  const z0 = 0.1;
  const z1 = 1.0;
  const backH = 1.05;
  const frontH = 0.78;
  const boardColor = c.wall ?? vary(0x9a6b43, rnd, 0.4);
  s.box(x0, 0, z0, x1, backH, z0 + 0.06, boardColor);
  for (let i = 0; i < 12; i++) {
    const x = x0 + ((x1 - x0) * i) / 12;
    s.box(x, 0, z0 - 0.01, x + 0.012, backH, z0 + 0.065, vary(boardColor, rnd, 2));
  }
  for (const x of [x0, x1]) {
    s.quad(
      [x, 0, z0],
      [x, 0, z0 + 0.5],
      [x, (backH + frontH) / 2 + 0.08, z0 + 0.5],
      [x, backH, z0],
      boardColor,
      [x < 1 ? -1 : 1, 0, 0],
    );
    s.quad(
      [x, 0, z0],
      [x, 0, z0 + 0.5],
      [x, (backH + frontH) / 2 + 0.08, z0 + 0.5],
      [x, backH, z0],
      vary(boardColor, rnd),
      [x < 1 ? 1 : -1, 0, 0],
    );
  }
  for (const x of [x0 + 0.03, (x0 + x1) / 2, x1 - 0.03])
    beam(s, [x, 0, z1 - 0.04], [x, frontH, z1 - 0.04], 0.03, palette.timber);
  beam(s, [x0, frontH, z1 - 0.04], [x1, frontH, z1 - 0.04], 0.03, palette.timber);
  const material = c.roofMaterial ?? 'shingle';
  roofPart(s, {
    shape: 'lean',
    material,
    x0: x0 - 0.1,
    z0: z0 - 0.1,
    x1: x1 + 0.1,
    z1: z1 + 0.16,
    y0: frontH - 0.02,
    y1: backH + 0.06,
    color: vary(roofColor(c, material, 0x7d6a55), rnd, 0.5),
    trim: palette.timber,
    ridgeAlongX: true,
    rnd,
  });
  s.rbox(0.4, 0, 0.28, 1.4, 0.3, 0.52, vary(palette.wood, rnd, 0.5), 0.01);
  for (const [x, l] of [
    [0.6, 0.3],
    [0.9, 0.22],
    [1.15, 0.26],
  ] as const) {
    s.box(x - 0.012, 0.55, z0 + 0.065, x + 0.012, 0.55 + l, z0 + 0.08, palette.wood);
    s.box(x - 0.04, 0.55 + l - 0.04, z0 + 0.065, x + 0.04, 0.55 + l, z0 + 0.09, palette.metal);
  }
  barrel(s, 2.3, 0, 0.4, rnd);
  barrel(s, 2.48, 0, 0.5, rnd, 0.85);
  // The yard: timber and stone ready for the next job, sawhorses, a gantry with a hanging block.
  pileOf(s, 'planks', Math.max(1, level(opts, 'stock:planks')), 0.55, 0, 1.45, rnd);
  pileOf(s, 'logs', Math.max(1, level(opts, 'stock:logs')), 0.55, 0, 2.35, rnd);
  pileOf(s, 'stone', Math.max(1, level(opts, 'stock:stone')), 2.45, 0, 2.55, rnd);
  sawhorse(s, 2.0, 1.4, true, rnd);
  sawhorse(s, 2.5, 1.4, true, rnd);
  s.box(1.8, 0.22, 1.36, 2.7, 0.245, 1.46, vary(GOOD_COLORS.plank, rnd, 0.5));
  const gx0 = 1.95;
  const gx1 = 2.85;
  const gz = 1.95;
  for (const x of [gx0, gx1]) {
    beam(s, [x, 0, gz - 0.2], [x, 1.2, gz], 0.025, palette.timber);
    beam(s, [x, 0, gz + 0.2], [x, 1.2, gz], 0.025, palette.timber);
  }
  beam(s, [gx0 - 0.05, 1.2, gz], [gx1 + 0.05, 1.2, gz], 0.03, palette.timber);
  s.cylinder(2.4, gz, 0.04, 0.04, 1.08, 1.17, palette.metal, 6);
  beam(s, [2.4, 1.1, gz], [2.4, 0.62, gz], 0.005, 0xbfa27a);
  s.rbox(2.3, 0.44, gz - 0.08, 2.5, 0.6, gz + 0.08, vary(palette.stone, rnd, 0.8), 0.015);
  ladder(s, [x1 - 0.2, 0, z1 + 0.25], [x1 - 0.2, frontH + 0.12, z1 - 0.02], [1, 0, 0]);
  if (c.sign) signBoard(s, { dir: 'z+', plane: z1 }, w / 2, frontH - 0.1, 0.6, 0.0, anchors);
  return { s, anchors };
}

export const bakeryKit = kit('bakery', bakery);
export const buildersYardKit = kit('builders-yard', buildersYard);
export const farmhouseKit = kit('farmhouse', farmhouse);
export const fishersHutKit = kit('fishers-hut', fishersHut);
export const forestersLodgeKit = kit('foresters-lodge', forester);
export const marketStallKit = kit('market-stall', marketStall);
export const quarryKit = kit('quarry', quarry);
export const sawpitKit = kit('sawpit', sawpit);
export const storehouseKit = kit('storehouse', storehouse);
export const vegetablePlotKit = kit('vegetable-plot', vegetablePlot);
export const woodcutterKit = kit('woodcutter', woodcutter);
