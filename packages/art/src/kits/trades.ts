// C5E: the I3 buildings (docs/spec/13-ledger.md and 12-hearth.md): the pie shop with pies cooling
// on the sill, the chandler with candles dripping on a frame, the tailor with a dress form in the
// window and bolts of cloth, the carpenter's open bay of chairs and planks, the apiary's straw skeps
// and painted hives, the bath house with its steaming vent and tubs, the River Dock's planked jetty
// with a moored boat, the Stone Bridge, and the Herbalist's Cottage. Waterside kits run their jetty
// and arch out over the water behind them (z-, the side away from the entrance). Both levels from one code path;
// surface ids on every face.
import { seeded, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX } from '../shapes';
import { SURFACE } from '../surface';
import { shell, signBoard, windowRow, windowStyle, type Built } from './buildings';
import { flowerBorder, ivyPart } from './details';
import { GOOD_COLORS } from './goods';
import {
  awningPart,
  chimneyPart,
  doorPart,
  faceBox,
  facePoint,
  hangingSign,
  kitBuilder,
  windowPart,
  type Face,
  type WallMaterial,
} from './parts';
import { barrel, bench, flowerPot, groundPatch, rowboat, sawhorse, wallLantern, wattle } from './props';
import type { RoofMaterial, RoofShape } from './roofs';
import { customOf, FLOWERS, level, roofColor, streams } from './style';
import type { Kit, KitAnchors, KitBuildOptions } from './types';
import { herbalist } from './services';
import { pileOf } from './goods';

interface TradeSpec {
  seed: number;
  wall: WallMaterial;
  wallColor: number;
  roof: RoofMaterial;
  roofColor?: number;
  shape: RoofShape;
  wallH: number;
  accent: number;
  inset?: [number, number, number, number];
  upper?: { at: number; wall: WallMaterial; color: number; jetty: number };
}

interface Trade extends Built {
  front: Face;
  doorU: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  ridge: number;
  rnd: () => number;
}

/** A small trade house: walls, a roof, the door on the entrance tile, windows, a chimney. */
function tradeHouse(opts: KitBuildOptions | undefined, sp: TradeSpec): Trade {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [0, d - 1];
  const { rnd, look } = streams(opts, sp.seed);
  const c = customOf(opts);
  const s = kitBuilder(opts);
  const anchors: KitAnchors = { smoke: [], lights: [] };
  const [i0, i1, i2, i3] = sp.inset ?? [0.22, 0.26, 0.22, 0.5];
  const x0 = i0;
  const z0 = i1;
  const x1 = w - i2;
  const z1 = d - i3;
  const material = c.roofMaterial ?? sp.roof;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: sp.wallH,
    wall: sp.wall,
    wallColor: c.wall ?? vary(sp.wallColor, rnd, 0.4),
    trim: palette.timber,
    ...(sp.upper ? { upper: sp.upper } : {}),
    roof: {
      shape: sp.shape,
      material,
      color: vary(roofColor(c, material, sp.roofColor), rnd, 0.6),
      rise: 0.7,
      overhang: 0.18,
      ridgeAlongX: true,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = Math.min(x1 - 0.22, Math.max(x0 + 0.22, ex + 0.5));
  const accent = c.accent ?? sp.accent;
  doorPart(s, front, doorU, 0.26, 0.5, accent, palette.timber, look() < 0.5 ? 'plank' : 'dutch', 0.012);
  const style = windowStyle(c, accent, { box: true, shutters: look() < 0.5 });
  if (sp.wallH > 0.95)
    windowRow(s, front, x0, x1, sp.wallH - 0.2, style, rnd, anchors.lights!, [], 0.55, [0.18, 0.2], 0.02);
  windowRow(
    s,
    { dir: 'x+', plane: x1 },
    z0,
    z1,
    0.42,
    style,
    rnd,
    anchors.lights!,
    [],
    0.6,
    [0.18, 0.2],
    0.02,
  );
  windowRow(
    s,
    { dir: 'x-', plane: x0 },
    z0,
    z1,
    0.42,
    style,
    rnd,
    anchors.lights!,
    [],
    0.6,
    [0.18, 0.2],
    0.02,
  );
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(
        s,
        x1 - 0.25,
        (z0 + z1) / 2 - 0.05,
        sh.top - 0.1,
        sh.ridge + 0.14,
        vary(palette.brick, rnd),
      ),
    );
  anchors.lights!.push(wallLantern(s, facePoint(front, doorU + 0.22, 0.56, 0.02), [0, 0, 1]));
  if (c.sign) signBoard(s, front, doorU, 0.74, 0.4, 0.012, anchors);
  return { s, anchors, front, doorU, x0, x1, z0, z1, top: sh.top, ridge: sh.ridge, rnd };
}

/** The shop window beside the door: wide, low, lit at night. Returns its middle. */
function shopWindow(t: Trade, w = 0.42): number {
  const u = t.doorU < (t.x0 + t.x1) / 2 ? t.x1 - w / 2 - 0.1 : t.x0 + w / 2 + 0.1;
  windowPart(
    t.s,
    t.front,
    u,
    0.4,
    w,
    0.3,
    { frame: palette.white, shutter: null, box: false, flowers: [] },
    t.rnd,
    t.anchors.lights,
    0.012,
  );
  return u;
}

function finish(t: Trade): Built {
  t.s.surface(SURFACE.plain);
  return { s: t.s, anchors: t.anchors };
}

// --- Pie shop ----------------------------------------------------------------------------------

function pieShop(opts: KitBuildOptions | undefined): Built {
  const t = tradeHouse(opts, {
    seed: 107,
    wall: 'plaster',
    wallColor: palette.plasterButter,
    roof: 'tile',
    shape: 'gable',
    wallH: 0.82,
    accent: 0x9c4f43,
  });
  const { s, front, rnd } = t;
  const u = shopWindow(t);
  s.detail(() => {
    // Pies cooling on the sill, a striped awning, a bench, and a pie on the hanging sign.
    faceBox(s, front, u - 0.24, 0.24, 0.012, u + 0.24, 0.255, 0.09, palette.white);
    for (let i = 0; i < 3; i++) {
      const p = facePoint(front, u - 0.15 + i * 0.15, 0.255, 0.055);
      s.cylinder(p[0], p[2], 0.05, 0.055, 0.255, 0.275, 0xd9a35a, 8);
      s.cylinder(p[0], p[2], 0.05, 0.0, 0.275, 0.29, vary(0xc98a45, rnd, 0.3), 8);
    }
    awningPart(s, front, u - 0.28, u + 0.28, 0.66, 0.24, 0x9c4f43, 0xf4ecdd, 5);
    bench(s, t.doorU < u ? t.doorU - 0.4 : t.doorU + 0.4, t.z1 + 0.18, true, rnd);
    hangingSign(
      s,
      front,
      t.doorU < u ? t.doorU - 0.24 : t.doorU + 0.24,
      0.74,
      vary(palette.paper, rnd, 0.3),
      (ss, c) => {
        ss.cylinder(c[0], c[2] + 0.02, 0.05, 0.05, c[1] - 0.02, c[1] + 0.0, 0xd9a35a, 8);
        ss.cylinder(c[0], c[2] + 0.02, 0.05, 0.0, c[1], c[1] + 0.02, 0xc98a45, 8);
      },
    );
  });
  pileOf(s, 'flour', level(opts, 'in:flour'), t.x0 + 0.15, 0, t.z0 - 0.1, rnd);
  pileOf(s, 'apples', level(opts, 'in:apples'), t.x1 - 0.1, 0, t.z0 - 0.1, rnd);
  return finish(t);
}

// --- Chandler ----------------------------------------------------------------------------------

function chandler(opts: KitBuildOptions | undefined): Built {
  const t = tradeHouse(opts, {
    seed: 109,
    wall: 'timber',
    wallColor: palette.plasterCream,
    roof: 'slate',
    shape: 'gable',
    wallH: 1.05,
    accent: 0x45607a,
    inset: [0.3, 0.26, 0.3, 0.5],
    upper: { at: 0.52, wall: 'plaster', color: 0xe9dcc0, jetty: 0.05 },
  });
  const { s, front, rnd, anchors } = t;
  const u = shopWindow(t, 0.34);
  s.detail(() => {
    // Candles lit in the window, a dipping frame of drying tapers outside, tallow pots.
    for (let i = 0; i < 4; i++) {
      const p = facePoint(front, u - 0.11 + i * 0.075, 0.28, 0.03);
      s.cylinder(p[0], p[2], 0.01, 0.01, 0.28, 0.33 + (i % 2) * 0.03, 0xf3ecdc, 5);
      s.glow(2);
      s.blob(p[0], 0.34 + (i % 2) * 0.03, p[2], 0.007, 0.012, 0.007, palette.lantern, 0);
      s.glow(0);
    }
    anchors.lights!.push(facePoint(front, u, 0.33, 0.04));
    const fx = t.doorU < u ? t.x0 - 0.05 : t.x1 + 0.05;
    const fz = t.z1 + 0.2;
    for (const dx of [-0.16, 0.16]) beam(s, [fx + dx, 0, fz], [fx + dx, 0.42, fz], 0.012, palette.timber);
    beam(s, [fx - 0.18, 0.42, fz], [fx + 0.18, 0.42, fz], 0.012, palette.timber);
    for (let i = 0; i < 6; i++) {
      const x = fx - 0.13 + i * 0.052;
      beam(s, [x, 0.42, fz], [x, 0.36, fz], 0.002, 0xbfa27a);
      s.cylinder(x, fz, 0.008, 0.01, 0.2, 0.36, vary(0xf3ecdc, rnd, 0.3), 4);
    }
    s.cylinder(fx + 0.3, fz, 0.07, 0.08, 0, 0.12, 0x4b4f55, 8);
    s.cylinder(fx + 0.3, fz, 0.065, 0.065, 0.12, 0.125, 0xece4d2, 8);
    hangingSign(
      s,
      front,
      t.doorU < u ? t.doorU - 0.24 : t.doorU + 0.24,
      0.76,
      vary(palette.paper, rnd, 0.3),
      (ss, c) => {
        ss.cylinder(c[0], c[2] + 0.02, 0.015, 0.015, c[1] - 0.05, c[1] + 0.03, 0xf3ecdc, 6);
        ss.glow(2);
        ss.blob(c[0], c[1] + 0.05, c[2] + 0.02, 0.012, 0.02, 0.012, palette.lantern, 0);
        ss.glow(0);
      },
    );
  });
  pileOf(s, 'herbs', level(opts, 'in:herbs'), t.x1 - 0.1, 0, t.z0 - 0.1, rnd);
  return finish(t);
}

// --- Tailor ------------------------------------------------------------------------------------

function tailor(opts: KitBuildOptions | undefined): Built {
  const t = tradeHouse(opts, {
    seed: 113,
    wall: 'brick',
    wallColor: palette.brick,
    roof: 'tile',
    shape: 'halfHip',
    wallH: 1.05,
    accent: 0x7a5468,
  });
  const { s, front, rnd } = t;
  const u = shopWindow(t, 0.44);
  s.detail(() => {
    // A dress form in a soft frock behind the glass, bolts of cloth on a rack by the door.
    const p = facePoint(front, u, 0.22, -0.06);
    s.cylinder(p[0], p[2], 0.008, 0.008, 0.22, 0.3, palette.darkWood, 4);
    s.blob(p[0], 0.4, p[2], 0.06, 0.1, 0.045, vary(0x9cc3dd, rnd, 0.3), 0);
    s.blob(p[0], 0.31, p[2], 0.08, 0.05, 0.06, vary(0x9cc3dd, rnd, 0.3), 0);
    const ru = t.doorU < u ? t.doorU - 0.42 : t.doorU + 0.42;
    const rz = t.z1 + 0.14;
    s.box(ru - 0.16, 0, rz - 0.06, ru + 0.16, 0.03, rz + 0.06, palette.timber);
    for (let i = 0; i < 4; i++)
      cylX(
        s,
        ru - 0.14,
        ru + 0.14,
        0.06 + i * 0.065,
        rz + (i % 2 ? 0.01 : -0.01),
        0.03,
        vary([GOOD_COLORS.cloth, 0xe9a0a8, 0xd1a24a, 0x7f9a52][i]!, rnd, 0.3),
        8,
      );
    hangingSign(
      s,
      front,
      t.doorU < u ? t.doorU + 0.24 : t.doorU - 0.24,
      0.8,
      vary(palette.paper, rnd, 0.3),
      (ss, c) => {
        for (const k of [-1, 1])
          beam(
            ss,
            [c[0] - 0.04, c[1] - 0.04 * k, c[2] + 0.02],
            [c[0] + 0.04, c[1] + 0.04 * k, c[2] + 0.02],
            0.006,
            0x5c6168,
          );
        ss.blob(c[0] - 0.045, c[1] + 0.045, c[2] + 0.02, 0.014, 0.014, 0.005, 0x5c6168, 0);
        ss.blob(c[0] - 0.045, c[1] - 0.045, c[2] + 0.02, 0.014, 0.014, 0.005, 0x5c6168, 0);
      },
    );
  });
  pileOf(s, 'cloth', level(opts, 'in:cloth'), t.x1 - 0.1, 0, t.z0 - 0.1, rnd);
  return finish(t);
}

// --- Carpenter ---------------------------------------------------------------------------------

function carpenter(opts: KitBuildOptions | undefined): Built {
  const t = tradeHouse(opts, {
    seed: 127,
    wall: 'weatherboard',
    wallColor: 0xb08a5e,
    roof: 'shingle',
    shape: 'gable',
    wallH: 0.8,
    accent: 0x5f7a52,
  });
  const { s, front, rnd } = t;
  s.detail(() => {
    // A lean-to of planks against the side, a sawhorse with a board, a new chair and a little table
    // set out to be admired, and a chair on the sign.
    const side = t.doorU < (t.x0 + t.x1) / 2 ? 1 : -1;
    const lx = side > 0 ? t.x1 + 0.04 : t.x0 - 0.04;
    for (let i = 0; i < 6; i++) {
      const z = t.z0 + 0.08 + i * 0.07;
      beam(s, [lx + side * 0.18, 0, z], [lx, 0.6, z], 0.018, vary(0xd8ae78, rnd, 0.6));
    }
    sawhorse(s, t.doorU + side * 0.45, t.z1 + 0.22, true, rnd);
    s.box(
      t.doorU + side * 0.45 - 0.2,
      0.15,
      t.z1 + 0.19,
      t.doorU + side * 0.45 + 0.2,
      0.165,
      t.z1 + 0.25,
      0xd8ae78,
    );
    const cx = t.doorU - side * 0.4;
    const cz = t.z1 + 0.22;
    const wood = vary(0xa67445, rnd, 0.4);
    s.box(cx - 0.07, 0.11, cz - 0.07, cx + 0.07, 0.125, cz + 0.07, wood);
    for (const [dx, dz] of [
      [-0.06, -0.06],
      [0.05, -0.06],
      [-0.06, 0.05],
      [0.05, 0.05],
    ] as const)
      s.box(cx + dx, 0, cz + dz, cx + dx + 0.012, 0.11, cz + dz + 0.012, wood);
    s.box(cx - 0.07, 0.125, cz - 0.07, cx + 0.07, 0.27, cz - 0.055, wood);
    hangingSign(s, front, t.doorU + side * 0.24, 0.72, vary(palette.paper, rnd, 0.3), (ss, c) => {
      ss.box(c[0] - 0.03, c[1] - 0.05, c[2] + 0.015, c[0] + 0.03, c[1] - 0.035, c[2] + 0.025, 0x6e4a2e);
      ss.box(c[0] - 0.03, c[1] - 0.035, c[2] + 0.015, c[0] - 0.02, c[1] + 0.05, c[2] + 0.025, 0x6e4a2e);
      ss.box(c[0] + 0.02, c[1] - 0.09, c[2] + 0.015, c[0] + 0.03, c[1] - 0.05, c[2] + 0.025, 0x6e4a2e);
      ss.box(c[0] - 0.03, c[1] - 0.09, c[2] + 0.015, c[0] - 0.02, c[1] - 0.05, c[2] + 0.025, 0x6e4a2e);
    });
  });
  groundPatch(s, t.doorU - 0.6, t.z1 + 0.05, t.doorU + 0.6, t.z1 + 0.45, 0xb39a70, rnd);
  pileOf(s, 'planks', level(opts, 'in:planks'), t.x0 + 0.15, 0, t.z0 - 0.1, rnd);
  pileOf(s, 'furniture', level(opts, 'out:furniture'), t.x1 - 0.1, 0, t.z0 - 0.1, rnd);
  return finish(t);
}

// --- Bath house --------------------------------------------------------------------------------

function bathHouse(opts: KitBuildOptions | undefined): Built {
  const t = tradeHouse(opts, {
    seed: 131,
    wall: 'stone',
    wallColor: 0xd8d0c0,
    roof: 'slate',
    shape: 'hip',
    wallH: 0.95,
    accent: 0x3f7f7a,
    inset: [0.2, 0.22, 0.2, 0.48],
  });
  const { s, front, rnd, anchors } = t;
  // A louvered vent on the ridge where the steam goes out (it puffs like a chimney).
  const vx = (t.x0 + t.x1) / 2;
  const vz = (t.z0 + t.z1) / 2;
  s.surface(SURFACE.timber);
  s.box(
    vx - 0.16,
    t.ridge - 0.08,
    vz - 0.12,
    vx + 0.16,
    t.ridge + 0.16,
    vz + 0.12,
    vary(palette.plasterCream, rnd, 0.3),
  );
  s.surface(SURFACE.slate);
  s.gable(vx - 0.22, vz - 0.17, vx + 0.22, vz + 0.17, t.ridge + 0.16, t.ridge + 0.3, palette.roofSlate, true);
  anchors.smoke!.push([vx, t.ridge + 0.3, vz]);
  s.surface(SURFACE.plain);
  // Big round-headed windows, steamy and lit.
  const style = { frame: palette.white, shutter: null, box: false, flowers: [] };
  for (const u of [t.x0 + 0.35, t.x1 - 0.35])
    if (Math.abs(u - t.doorU) > 0.35)
      windowPart(s, front, u, 0.5, 0.26, 0.36, style, rnd, anchors.lights, 0.012);
  s.detail(() => {
    // Wooden tubs and a stack of towels, a drying line, a bench, potted bay trees by the door.
    for (const [dx, k] of [
      [-0.55, 1],
      [0.62, 0.8],
    ] as const) {
      const x = t.doorU + dx;
      if (x < 0.15 || x > (opts?.size?.[0] ?? 3) - 0.15) continue;
      s.cylinder(x, t.z1 + 0.25, 0.12 * k, 0.11 * k, 0, 0.14 * k, vary(palette.wood, rnd, 0.4), 10);
      s.cylinder(x, t.z1 + 0.25, 0.123 * k, 0.123 * k, 0.03, 0.045, palette.metal, 10);
      s.surface(SURFACE.water);
      s.cylinder(x, t.z1 + 0.25, 0.1 * k, 0.1 * k, 0.12 * k, 0.125 * k, 0x9cc8d0, 10);
      s.surface(SURFACE.plain);
    }
    for (let i = 0; i < 3; i++)
      s.box(
        t.x1 - 0.2,
        0.0 + i * 0.03,
        t.z1 + 0.1,
        t.x1 - 0.06,
        0.03 + i * 0.03,
        t.z1 + 0.22,
        [0xf4ecdd, 0x9cc3dd, 0xe9a0a8][i]!,
      );
    for (const k of [-1, 1]) flowerPot(s, t.doorU + k * 0.22, 0, t.z1 + 0.08, rnd, 0x6f9a4a);
    hangingSign(s, front, t.doorU + 0.26, 0.8, vary(palette.paper, rnd, 0.3), (ss, c) => {
      for (let i = 0; i < 3; i++)
        beam(
          ss,
          [c[0] - 0.03 + i * 0.03, c[1] - 0.04, c[2] + 0.02],
          [c[0] - 0.03 + i * 0.03 + 0.01, c[1] + 0.05, c[2] + 0.02],
          0.008,
          0x9cc8d0,
        );
    });
  });
  pileOf(s, 'firewood', level(opts, 'in:firewood'), t.x0 + 0.1, 0, t.z0 - 0.08, rnd);
  return finish(t);
}

// --- Apiary ------------------------------------------------------------------------------------

function apiary(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const rnd = seeded((opts?.seed ?? 1) * 7 + 137);
  const s = kitBuilder(opts);
  const anchors: KitAnchors = { smoke: [], lights: [] };
  // The keeper's little shed at the back, a meadow with a wattle edge, straw skeps on a bench and
  // painted box hives on stands, lavender all round.
  groundPatch(s, 0.1, 0.1, w - 0.1, d - 0.1, 0x9fb36a, rnd);
  s.surface(SURFACE.timber);
  s.rbox(0.15, 0, 0.12, 0.75, 0.5, 0.55, vary(0xb08a5e, rnd, 0.4), 0.01);
  s.surface(SURFACE.thatch);
  s.gable(0.08, 0.04, 0.82, 0.63, 0.5, 0.75, vary(palette.roofThatch, rnd, 0.4), true);
  s.surface(SURFACE.timber);
  doorPart(
    s,
    { dir: 'z+', plane: 0.55 },
    0.45,
    0.18,
    0.36,
    vary(0x6e8a5a, rnd, 0.3),
    palette.timber,
    'plank',
    0.01,
  );
  // A bench of skeps.
  s.box(0.95, 0.12, 0.25, w - 0.15, 0.15, 0.45, palette.wood);
  for (const x of [1.0, w - 0.2]) s.box(x - 0.02, 0, 0.27, x + 0.02, 0.12, 0.43, palette.timber);
  s.surface(SURFACE.thatch);
  const skeps = Math.floor((w - 1.15) / 0.2);
  for (let i = 0; i < skeps; i++) {
    const x = 1.05 + i * 0.2;
    s.levels(
      () => {
        for (let k = 0; k < 4; k++)
          s.cylinder(
            x,
            0.35,
            0.085 - k * 0.018,
            0.075 - k * 0.018,
            0.15 + k * 0.04,
            0.19 + k * 0.04,
            vary(0xd9b06a, rnd, 0.3),
            8,
          );
        s.surface(SURFACE.plain);
        s.box(x - 0.02, 0.15, 0.43, x + 0.02, 0.18, 0.44, 0x3b3229);
        s.surface(SURFACE.thatch);
      },
      () => void s.cylinder(x, 0.35, 0.085, 0.0, 0.15, 0.33, 0xd9b06a, 4),
    );
  }
  // Box hives on stands in soft paint.
  s.surface(SURFACE.timber);
  const colors = [0xf4ecdd, 0x9cc3dd, 0xf3d35b, 0xb8d8a8];
  for (let i = 0; i < 3; i++) {
    const x = 0.35 + i * 0.5;
    const z = d - 0.55;
    const c = colors[(i + Math.floor(rnd() * 4)) % 4]!;
    s.box(x - 0.1, 0, z - 0.1, x + 0.1, 0.1, z + 0.1, palette.darkWood);
    s.rbox(x - 0.12, 0.1, z - 0.12, x + 0.12, 0.3, z + 0.12, vary(c, rnd, 0.2), 0.008);
    s.surface(SURFACE.zinc);
    s.gable(x - 0.14, z - 0.14, x + 0.14, z + 0.14, 0.3, 0.36, 0x8a9aa0, true);
    s.surface(SURFACE.timber);
    s.nearOnly(() => s.box(x - 0.05, 0.12, z + 0.12, x + 0.05, 0.135, z + 0.13, 0x3b3229));
  }
  s.surface(SURFACE.plain);
  s.detail(() => {
    flowerBorder(s, [0.15, d - 0.15], [w - 0.15, d - 0.15], rnd);
    s.surface(SURFACE.flowers);
    for (let i = 0; i < 10; i++) {
      const x = 0.2 + rnd() * (w - 0.4);
      const z = 0.75 + rnd() * (d - 1.45);
      s.blob(x, 0.06, z, 0.06, 0.06, 0.06, vary(GOOD_COLORS.lavender, rnd, 0.5), 0);
    }
    s.surface(SURFACE.plain);
    wattle(s, [0.06, d - 0.06], [w - 0.06, d - 0.06], rnd);
    // The keeper's veiled hat on a peg.
    s.blob(0.7, 0.38, 0.57, 0.05, 0.02, 0.05, 0xf4ecdd, 0);
  });
  pileOf(s, 'honey', level(opts, 'out:honey'), w - 0.25, 0, 0.7, rnd);
  return { s, anchors };
}

// --- Waterside: the River Dock and the Stone Bridge ----------------------------------------------

function riverDock(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const rnd = seeded((opts?.seed ?? 1) * 7 + 139);
  const s = kitBuilder(opts);
  const anchors: KitAnchors = { smoke: [], lights: [] };
  // The shed on the front half (+z), the jetty out over the back (z-): the back faces the water.
  const deckY = 0.06;
  s.surface(SURFACE.timber);
  // Piles and a planked deck, running out a tile past the footprint over the water.
  for (const x of [0.15, w / 2, w - 0.15])
    for (const z of [-0.85, -0.2, 0.5])
      s.cylinder(x, z, 0.045, 0.045, -0.18, deckY + 0.12, vary(0x6b4a30, rnd, 0.4), 6);
  s.levels(
    () => {
      for (let i = 0; i < 14; i++) {
        const z = -0.95 + i * 0.1;
        s.box(0.05, deckY - 0.03, z, w - 0.05, deckY, z + 0.09, vary(0xa67c52, rnd, 0.4));
      }
    },
    () => void s.box(0.05, deckY - 0.03, -0.95, w - 0.05, deckY, 0.45, 0xa67c52),
  );
  // Bollards and a coiled rope, a crane of timber with a hanging net of goods.
  s.nearOnly(() => {
    for (const x of [0.2, w - 0.2]) {
      s.cylinder(x, -0.9, 0.04, 0.04, deckY, deckY + 0.14, palette.darkWood, 6);
      s.blob(x + 0.08, deckY + 0.02, -0.8, 0.05, 0.02, 0.05, GOOD_COLORS.rope, 0);
    }
  });
  beam(s, [w - 0.3, deckY, -0.2], [w - 0.3, 1.0, -0.2], 0.035, palette.timber);
  beam(s, [w - 0.3, 0.95, -0.2], [w - 0.3, 0.9, -0.8], 0.025, palette.timber);
  s.nearOnly(() => {
    beam(s, [w - 0.3, 0.9, -0.78], [w - 0.3, 0.55, -0.78], 0.004, GOOD_COLORS.rope);
    s.blob(w - 0.3, 0.47, -0.78, 0.08, 0.09, 0.08, vary(GOOD_COLORS.sack, rnd, 0.4), 1);
  });
  // The dock house: a weatherboarded store with a wide door, and a lantern.
  s.surface(SURFACE.plain);
  const hx0 = 0.2;
  const hx1 = w - 0.6;
  const hz0 = 0.6;
  const hz1 = d - 0.2;
  s.surface(SURFACE.timber);
  s.rbox(hx0, deckY, hz0, hx1, deckY + 0.6, hz1, vary(0x8a6a48, rnd, 0.4), 0.01);
  s.surface(SURFACE.slate);
  s.gable(
    hx0 - 0.08,
    hz0 - 0.1,
    hx1 + 0.08,
    hz1 + 0.1,
    deckY + 0.6,
    deckY + 0.9,
    vary(palette.roofSlate, rnd, 0.4),
    true,
  );
  s.surface(SURFACE.timber);
  doorPart(
    s,
    { dir: 'z-', plane: hz0 },
    (hx0 + hx1) / 2,
    0.34,
    0.46,
    vary(0x45607a, rnd, 0.3),
    palette.timber,
    'double',
    0.01,
  );
  doorPart(
    s,
    { dir: 'z+', plane: hz1 },
    (hx0 + hx1) / 2,
    0.22,
    0.44,
    vary(0x45607a, rnd, 0.3),
    palette.timber,
    'plank',
    0.01,
  );
  anchors.lights!.push(wallLantern(s, [hx1 + 0.02, deckY + 0.45, (hz0 + hz1) / 2], [1, 0, 0]));
  s.detail(() => {
    barrel(s, w - 0.25, deckY, 0.9, rnd);
    barrel(s, w - 0.3, deckY, 1.15, rnd);
    s.rbox(w - 0.45, deckY, 1.35, w - 0.15, deckY + 0.16, 1.55, vary(GOOD_COLORS.crate, rnd, 0.5), 0.01);
  });
  // The boat moored alongside, low in the water.
  rowboat(s, w + 0.2, -0.04, -0.55, false, 0x6e8a9a, rnd);
  s.surface(SURFACE.plain);
  return { s, anchors };
}

function stoneBridge(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 2];
  const rnd = seeded((opts?.seed ?? 1) * 7 + 149);
  const s = kitBuilder(opts);
  const anchors: KitAnchors = { lights: [] };
  // A humpbacked bridge of dressed stone springing from the bank (the front, +z) out over the
  // water (z-), a round arch beneath and its reflection's dark mouth, parapets, and lamps.
  const tone = vary(0xcfc6b2, rnd, 0.4);
  const zA = d - 0.1;
  // Across the water behind (params `span`, in tiles) onto the far bank.
  const span0 = Number(opts?.params?.span ?? 0);
  const zB = -Math.max(1.4, Math.min(8, span0) + 0.5);
  const span = zA - zB;
  const x0 = w / 2 - 0.55;
  const x1 = w / 2 + 0.55;
  const n = Math.max(10, Math.round(span * 2.5));
  const rise = Math.min(0.75, 0.3 + span * 0.08);
  const deck = (t: number): number => 0.16 + Math.sin(t * Math.PI) * rise;
  s.surface(SURFACE.stone);
  s.jitter(0.04);
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const za = zA - span * t0;
    const zb = zA - span * t1;
    const ya = deck(t0);
    const yb = deck(t1);
    // The deck's two sides (spandrels) down to the arch, and the cobbled top.
    const arch = (t: number): number =>
      Math.max(-0.18, Math.sin(Math.min(1, Math.max(0, (t - 0.15) / 0.7)) * Math.PI) * 0.36 - 0.18);
    for (const x of [x0, x1]) {
      const out: V3 = [x === x0 ? -1 : 1, 0, 0];
      s.quad([x, arch(t0), za], [x, arch(t1), zb], [x, yb, zb], [x, ya, za], tone, out);
    }
    s.quad(
      [x0, arch(t0), za],
      [x1, arch(t0), za],
      [x1, arch(t1), zb],
      [x0, arch(t1), zb],
      vary(tone, rnd, 0.4),
      [0, -1, 0],
    );
    s.surface(SURFACE.cobble);
    s.quad([x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb], vary(0xb9b1a3, rnd, 0.3), [0, 1, 0]);
    s.surface(SURFACE.stone);
    // Parapets.
    for (const x of [x0, x1 - 0.08]) {
      s.quad(
        [x, ya + 0.14, za],
        [x + 0.08, ya + 0.14, za],
        [x + 0.08, yb + 0.14, zb],
        [x, yb + 0.14, zb],
        tone,
        [0, 1, 0],
      );
      s.quad([x, ya, za], [x, yb, zb], [x, yb + 0.14, zb], [x, ya + 0.14, za], tone, [-1, 0, 0]);
      s.quad(
        [x + 0.08, ya, za],
        [x + 0.08, yb, zb],
        [x + 0.08, yb + 0.14, zb],
        [x + 0.08, ya + 0.14, za],
        tone,
        [1, 0, 0],
      );
    }
  }
  s.jitter(0);
  // Abutments on both banks, a lamp at each end of the near one.
  if (span0 > 0) {
    s.rbox(x0 - 0.12, 0, zB, x0 + 0.02, 0.3, zB + 0.3, tone, 0.02);
    s.rbox(x1 - 0.02, 0, zB, x1 + 0.12, 0.3, zB + 0.3, tone, 0.02);
  }
  s.rbox(x0 - 0.12, 0, zA - 0.3, x0 + 0.02, 0.4, zA, tone, 0.02);
  s.rbox(x1 - 0.02, 0, zA - 0.3, x1 + 0.12, 0.4, zA, tone, 0.02);
  for (const x of [x0 - 0.05, x1 + 0.05]) {
    s.surface(SURFACE.plain);
    s.cylinder(x, zA - 0.15, 0.015, 0.015, 0.4, 0.62, palette.metal, 6);
    s.glow(2);
    s.box(x - 0.035, 0.62, zA - 0.185, x + 0.035, 0.7, zA - 0.115, palette.lantern);
    s.glow(0);
    s.cylinder(x, zA - 0.15, 0.05, 0, 0.7, 0.75, palette.metal, 4, Math.PI / 4);
    anchors.lights!.push([x, 0.66, zA - 0.15]);
  }
  s.surface(SURFACE.plain);
  s.detail(() => {
    // Ivy over one abutment and a few flowers in the parapet's cracks.
    ivyPart(s, { dir: 'x-', plane: x0 - 0.12 }, zA - 0.3, zA, 0.38, rnd);
    s.surface(SURFACE.flowers);
    for (let i = 0; i < 5; i++)
      s.blob(
        x1 + 0.0,
        deck(0.2 + i * 0.12) + 0.15,
        zA - span * (0.2 + i * 0.12),
        0.02,
        0.02,
        0.02,
        FLOWERS[i % FLOWERS.length]!,
        0,
      );
    s.surface(SURFACE.plain);
  });
  return { s, anchors };
}

// --- The Herbalist's Cottage --------------------------------------------------------------------

function herbalistsCottage(opts: KitBuildOptions | undefined): Built {
  // The herbalist's crooked cottage, lived in: a glass cold frame of seedlings and a drying rack.
  const b = herbalist({ ...opts, seed: (opts?.seed ?? 1) + 5 });
  const s = b.s;
  const [w] = opts?.size ?? [2, 2];
  const rnd = seeded((opts?.seed ?? 1) * 7 + 151);
  s.detail(() => {
    s.surface(SURFACE.timber);
    s.box(w - 0.55, 0, 0.05, w - 0.1, 0.1, 0.28, palette.timber);
    s.surface(SURFACE.glass);
    s.quad(
      [w - 0.55, 0.1, 0.05],
      [w - 0.1, 0.1, 0.05],
      [w - 0.1, 0.16, 0.28],
      [w - 0.55, 0.16, 0.28],
      0x9fb7c9,
      [0, 1, -0.5],
    );
    s.surface(SURFACE.leaf);
    for (let i = 0; i < 4; i++)
      s.blob(w - 0.5 + i * 0.11, 0.1, 0.16, 0.035, 0.03, 0.035, vary(palette.leaf, rnd, 0.6), 0);
    s.surface(SURFACE.timber);
    for (const x of [0.1, 0.5]) beam(s, [x, 0, 0.12], [x, 0.4, 0.12], 0.012, palette.timber);
    beam(s, [0.1, 0.38, 0.12], [0.5, 0.38, 0.12], 0.01, palette.timber);
    s.surface(SURFACE.plain);
    for (let i = 0; i < 4; i++)
      s.blob(
        0.16 + i * 0.1,
        0.3,
        0.12,
        0.025,
        0.06,
        0.025,
        vary([0x6f9a4a, 0x9f86c8, 0xd9a03a][i % 3]!, rnd, 0.4),
        0,
      );
  });
  return b;
}

function tradeKit(
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

export const apiaryKit = tradeKit('apiary', [2, 2], [0, 1], apiary);
export const bathHouseKit = tradeKit('bath-house', [3, 2], [1, 1], bathHouse);
export const carpenterKit = tradeKit('carpenter', [2, 2], [0, 1], carpenter);
export const chandlerKit = tradeKit('chandler', [2, 2], [0, 1], chandler);
export const herbalistsCottageKit = tradeKit('herbalists-cottage', [2, 2], [1, 1], herbalistsCottage);
export const pieShopKit = tradeKit('pie-shop', [2, 2], [0, 1], pieShop);
export const riverDockKit = tradeKit('river-dock', [2, 2], [0, 1], riverDock);
export const stoneBridgeKit = tradeKit('stone-bridge', [3, 2], [1, 1], stoneBridge);
export const tailorKit = tradeKit('tailor', [2, 2], [0, 1], tailor);
