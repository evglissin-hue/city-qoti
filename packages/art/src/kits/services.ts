// C4E: the I2 service and trade buildings (docs/spec/13-ledger.md, Services and Trade): the school
// with its bell cote and playground, the tavern with its inn sign on a post and a beer garden under
// festoon lanterns, the herbalist's crooked cottage hung with bunches and bottles, the Trading Post's
// veranda of crates under neighbor pennants, and the cart shed with its wide bay and pony stall.
import { ShapeBuilder, vary, type V3 } from '../geometry';
import { palette } from '../palette';
import { beam, cylX, panel } from '../shapes';
import { shell, signBoard, windowRow, windowStyle, type Built } from './buildings';
import { bayWindow, flowerBorder, ivyPart, railing } from './details';
import { crateOf, GOOD_COLORS, pileOf } from './goods';
import {
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
  type WallMaterial,
} from './parts';
import { barrel, bench, flowerPot, groundPatch, hayBale, wallLantern, wattle, weathervane } from './props';
import { roofPart, type RoofMaterial } from './roofs';
import { customOf, level, roofColor, streams } from './style';
import type { KitAnchors, KitBuildOptions } from './types';
import { villageKit } from './village';

const IRON = 0x4b4f55;

function start(): Built {
  return { s: new ShapeBuilder(), anchors: { smoke: [], lights: [] } };
}

/** A string of festoon lanterns between two points, sagging a little; lit every night. */
function festoon(s: ShapeBuilder, a: V3, b: V3, n: number, lights: V3[]): void {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * 0.08;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t]);
  }
  for (let i = 0; i < n; i++) beam(s, pts[i]!, pts[i + 1]!, 0.003, 0x3b3229);
  const colors = [0xffc977, 0xf2b8c6, 0xffd58a, 0xbfe0a0];
  for (let i = 1; i < n; i++) {
    const p = pts[i]!;
    s.glow(2);
    s.blob(p[0], p[1] - 0.025, p[2], 0.018, 0.022, 0.018, colors[i % colors.length]!, 0);
    s.glow(0);
    if (i % 2 === 0) lights.push([p[0], p[1] - 0.03, p[2]]);
  }
}

/** A trestle table with benches either side and a few mugs. */
function trestle(s: ShapeBuilder, x: number, z: number, alongX: boolean, rnd: () => number): void {
  const L = 0.26;
  const wood = vary(palette.wood, rnd, 0.5);
  const box = (a0: number, y0: number, c0: number, a1: number, y1: number, c1: number, hex: number): void => {
    if (alongX) s.box(x + a0, y0, z + c0, x + a1, y1, z + c1, hex);
    else s.box(x + c0, y0, z + a0, x + c1, y1, z + a1, hex);
  };
  box(-L, 0.19, -0.08, L, 0.215, 0.08, wood);
  for (const a of [-L + 0.04, L - 0.06]) box(a, 0, -0.06, a + 0.02, 0.19, 0.06, palette.timber);
  for (const c of [-0.17, 0.17]) {
    box(-L, 0.11, c - 0.035, L, 0.13, c + 0.035, wood);
    for (const a of [-L + 0.04, L - 0.06]) box(a, 0, c - 0.025, a + 0.02, 0.11, c + 0.025, palette.timber);
  }
  for (let i = 0; i < 3; i++) {
    const a = -0.16 + i * 0.15 + (rnd() - 0.5) * 0.04;
    const c = (rnd() - 0.5) * 0.08;
    const [mx, mz] = alongX ? [x + a, z + c] : [x + c, z + a];
    s.cylinder(mx, mz, 0.018, 0.018, 0.215, 0.255, vary(0xc9b48a, rnd, 0.4), 6);
    s.cylinder(mx, mz, 0.016, 0.016, 0.255, 0.26, 0xf3ecdc, 6);
  }
}

// --- School -------------------------------------------------------------------------------------

/** A bell cote: an open frame with a bell under a little gabled roof. */
function bellCote(s: ShapeBuilder, x: number, y: number, z: number, roof: number, rnd: () => number): void {
  const h = 0.32;
  const r = 0.12;
  s.box(x - r - 0.02, y, z - r - 0.02, x + r + 0.02, y + 0.05, z + r + 0.02, palette.stone);
  for (const [px, pz] of [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ] as const)
    s.box(x + px - 0.022, y + 0.05, z + pz - 0.022, x + px + 0.022, y + h, z + pz + 0.022, palette.white);
  s.cylinder(x, z, 0.03, 0.075, y + 0.1, y + 0.24, palette.mustard, 8);
  s.blob(x, y + 0.255, z, 0.03, 0.02, 0.03, palette.mustard, 0);
  s.gable(
    x - r - 0.06,
    z - r - 0.06,
    x + r + 0.06,
    z + r + 0.06,
    y + h,
    y + h + 0.16,
    vary(roof, rnd, 0.3),
    false,
  );
  weathervane(s, x, y + h + 0.15, z);
}

function school(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 61);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.3;
  const x1 = w - 0.3;
  const z0 = 0.25;
  const z1 = d - 1.0;
  const wall: WallMaterial = look() < 0.55 ? 'brick' : 'stone';
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.6 ? 'slate' : 'tile');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.14,
    wallH: 1.12,
    wall,
    wallColor: wall === 'brick' ? vary(palette.brick, rnd, 0.5) : vary(palette.stone, rnd, 0.5),
    trim: palette.timber,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.95,
      overhang: 0.14,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  const cu = (x0 + x1) / 2;
  const accent = c.accent ?? (wall === 'brick' ? palette.teal : palette.navy);
  // The porch: a little gabled entrance with the door, a date stone above.
  const pz = z1 + 0.34;
  const pu = Math.min(Math.max(doorU, x0 + 0.4), x1 - 0.4);
  s.box(
    pu - 0.26,
    0,
    z1,
    pu + 0.26,
    0.72,
    pz,
    wall === 'brick' ? vary(palette.brick, rnd, 0.5) : vary(palette.stone, rnd, 0.5),
  );
  s.gable(pu - 0.32, z1 - 0.02, pu + 0.32, pz + 0.06, 0.72, 0.96, vary(sh.roof.color, rnd, 0.3), false);
  doorPart(s, { dir: 'z+', plane: pz }, pu, 0.3, 0.56, accent, palette.white, 'double', 0.0);
  faceBox(s, { dir: 'z+', plane: pz }, pu - 0.12, 0.62, 0, pu + 0.12, 0.7, 0.012, palette.paper);
  if (!plain) {
    const style = { ...windowStyle(c, accent, { box: false, shutters: false }), arch: true };
    for (const f of [
      { dir: 'x+', plane: x1 },
      { dir: 'x-', plane: x0 },
    ] as Face[])
      windowRow(s, f, z0, z1, 0.62, style, rnd, anchors.lights!, [], 0.5, [0.2, 0.42], claddingDepth(wall));
    for (const u of [x0 + 0.42, x1 - 0.42])
      if (Math.abs(u - pu) > 0.45)
        windowPart(s, front, u, 0.62, 0.2, 0.42, style, rnd, anchors.lights, claddingDepth(wall));
    // A round window high in the gable.
    windowPart(s, front, cu, sh.top + 0.35, 0.2, 0.08, { ...style, box: false }, rnd, anchors.lights, 0.015);
  }
  bellCote(s, cu, sh.ridge - 0.12, z1 - 0.12, sh.roof.color, rnd);
  if (c.chimney ?? true)
    anchors.smoke!.push(chimneyPart(s, x1 - 0.25, z0 + 0.35, sh.top - 0.1, sh.ridge - 0.1, palette.brick));
  if (!plain) {
    // The playground: gravel, railings with a gate, hopscotch chalked on the ground, a tree.
    groundPatch(s, 0.1, z1 + 0.05, w - 0.1, d - 0.1, vary(0xc9b89a, rnd, 0.3), rnd);
    railing(s, [0.08, d - 0.08], [doorU - 0.22, d - 0.08]);
    railing(s, [doorU + 0.22, d - 0.08], [w - 0.08, d - 0.08]);
    const hx = doorU < w / 2 ? w - 0.62 : 0.5;
    const hz = d - 0.55;
    for (let i = 0; i < 5; i++) {
      const two = i === 1 || i === 3;
      for (let k = 0; k < (two ? 2 : 1); k++) {
        const x = hx + (two ? (k - 0.5) * 0.1 : 0);
        const z = hz + 0.3 - i * 0.1;
        s.box(x - 0.045, 0.012, z - 0.045, x + 0.045, 0.016, z + 0.045, 0xf7f4ec);
        s.box(x - 0.035, 0.016, z - 0.035, x + 0.035, 0.018, z + 0.035, 0xc9b89a);
      }
    }
    const tx = doorU < w / 2 ? 0.45 : w - 0.45;
    s.cylinder(tx, d - 0.5, 0.05, 0.035, 0, 0.42, palette.bark, 5);
    const leaf = vary(palette.oakLeaf, rnd, 0.6);
    s.blob(tx, 0.6, d - 0.5, 0.28, 0.24, 0.28, leaf, 1, rnd, 0.1, vary(palette.birchLeaf, rnd, 0.5));
    bench(s, tx + (tx < w / 2 ? 0.35 : -0.35), d - 0.3, true, rnd);
    // A see-saw.
    const sx = doorU < w / 2 ? w - 0.4 : 0.85;
    s.box(sx - 0.03, 0, z1 + 0.42, sx + 0.03, 0.08, z1 + 0.48, palette.timber);
    beam(
      s,
      [sx - 0.25, 0.03, z1 + 0.45],
      [sx + 0.25, 0.13, z1 + 0.45],
      0.018,
      vary(palette.accentRed, rnd, 0.4),
    );
    anchors.lights!.push(wallLantern(s, facePoint({ dir: 'z+', plane: pz }, pu - 0.22, 0.6, 0.0), [0, 0, 1]));
  }
  if (c.sign) signBoard(s, { dir: 'z+', plane: z1 }, cu, sh.top + 0.08, 0.6, 0.02, anchors);
  return { s, anchors };
}

// --- Tavern -------------------------------------------------------------------------------------

/** An inn sign on a tall post with an arm, the board facing the street. Returns the board center. */
function innSign(s: ShapeBuilder, x: number, z: number, board: number, anchors: KitAnchors): V3 {
  beam(s, [x, 0, z], [x, 1.25, z], 0.03, palette.timber);
  s.cylinder(x, z, 0.06, 0.05, 0, 0.06, palette.stone, 6);
  beam(s, [x, 1.18, z], [x + 0.42, 1.18, z], 0.022, palette.timber);
  beam(s, [x, 1.0, z], [x + 0.2, 1.18, z], 0.014, palette.timber);
  for (const dx of [0.1, 0.36]) beam(s, [x + dx, 1.17, z], [x + dx, 1.1, z], 0.004, IRON);
  const cx = x + 0.23;
  s.box(cx - 0.17, 0.82, z - 0.018, cx + 0.17, 1.1, z + 0.018, palette.timber);
  s.box(cx - 0.15, 0.84, z - 0.024, cx + 0.15, 1.08, z + 0.024, board);
  const center: V3 = [cx, 0.96, z + 0.026];
  anchors.sign = { center, normal: [0, 0, 1], width: 0.28, height: 0.2 };
  return center;
}

function tavern(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 62);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.2;
  const z1 = d - 1.0;
  const lower: WallMaterial = look() < 0.5 ? 'stone' : 'brick';
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'tile' : 'thatch');
  const upper =
    c.wall ??
    vary(
      [palette.plasterCream, palette.plasterButter, palette.plasterRose][Math.floor(look() * 3)]!,
      rnd,
      0.4,
    );
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 1.5,
    wall: lower,
    wallColor: lower === 'stone' ? vary(palette.stone, rnd, 0.5) : vary(palette.brick, rnd, 0.5),
    trim: palette.timber,
    upper: { at: 0.74, wall: 'timber', color: upper, jetty: 0.07 },
    roof: {
      shape: look() < 0.5 ? 'halfHip' : 'gable',
      material,
      color: vary(roofColor(c, material, material === 'tile' ? 0xb0583a : undefined), rnd, 0.5),
      rise: 0.9,
      overhang: 0.18,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const [ox0, oz0, ox1, oz1] = sh.outer;
  const front: Face = { dir: 'z+', plane: z1 };
  const upFront: Face = { dir: 'z+', plane: oz1 };
  const doorU = Math.min(Math.max(ex + 0.5, x0 + 0.5), x1 - 0.5);
  const accent = c.accent ?? (look() < 0.5 ? palette.accentRed : 0x2f5a46);
  const clad = claddingDepth(lower);
  doorPart(s, front, doorU, 0.32, 0.62, accent, palette.timber, 'plank', clad);
  if (!plain) {
    porchPart(s, front, doorU, 0.38, 0.8, 0.28, vary(sh.roof.color, rnd, 0.3), palette.timber, true);
    // Bay windows either side of the door, glowing warm at night; casements upstairs.
    const left = (x0 + doorU - 0.25) / 2;
    const right = (doorU + 0.25 + x1) / 2;
    for (const u of [left, right])
      bayWindow(
        s,
        front,
        u,
        0.2,
        Math.min(0.62, Math.abs(u - doorU) * 1.2),
        0.42,
        0.14,
        palette.white,
        vary(sh.roof.color, rnd, 0.3),
        rnd,
        anchors.lights!,
        clad,
        true,
      );
    const style = windowStyle(c, accent, { box: true, shutters: false });
    windowRow(s, upFront, ox0, ox1, 1.18, style, rnd, anchors.lights!, [], 0.5, [0.22, 0.26], 0.012);
    for (const f of [
      { dir: 'x+', plane: ox1 },
      { dir: 'x-', plane: ox0 },
    ] as Face[]) {
      windowRow(
        s,
        f,
        oz0,
        oz1,
        1.18,
        { ...style, box: false },
        rnd,
        anchors.lights!,
        [],
        0.7,
        [0.2, 0.24],
        0.012,
      );
      windowRow(
        s,
        { dir: f.dir, plane: f.dir === 'x+' ? x1 : x0 },
        z0,
        z1,
        0.45,
        { ...style, box: false },
        rnd,
        anchors.lights!,
        [],
        0.8,
        [0.2, 0.24],
        clad,
      );
    }
    for (const u of [ox0 + 0.6, ox1 - 0.6])
      dormerPart(
        s,
        { dir: 'z+', plane: oz1 - 0.1 },
        u,
        sh.top + 0.02,
        0.3,
        upper,
        sh.roof.color,
        palette.timber,
        rnd,
        anchors.lights,
      );
    for (const u of [doorU - 0.3, doorU + 0.3])
      anchors.lights!.push(wallLantern(s, facePoint(front, u, 0.68, clad), [0, 0, 1]));
    // The beer garden: tables under festoon lanterns, barrels by the wall, the inn sign on its post.
    const gz0 = z1 + 0.35;
    const gz1 = d - 0.15;
    groundPatch(s, 0.1, z1 + 0.05, w - 0.1, d - 0.08, vary(0xc2a87e, rnd, 0.3), rnd);
    const tx = doorU < w / 2 ? doorU + 0.75 : doorU - 0.75;
    trestle(s, tx, (gz0 + gz1) / 2, true, rnd);
    if (w >= 3)
      trestle(
        s,
        doorU < w / 2 ? (tx + 0.75 > w - 0.3 ? tx - 1.5 : tx + 0.75) : tx - 0.75 < 0.3 ? tx + 1.5 : tx - 0.75,
        (gz0 + gz1) / 2,
        true,
        rnd,
      );
    const sx = doorU < w / 2 ? 0.25 : w - 0.25;
    innSign(s, sx, d - 0.2, vary(palette.paper, rnd, 0.3), anchors);
    if (!c.sign) {
      // A painted fox with a tankard, more or less.
      const bx = sx + 0.23;
      s.blob(bx - 0.05, 0.95, d - 0.17, 0.06, 0.07, 0.008, 0xd98a3a, 0);
      s.blob(bx - 0.03, 1.02, d - 0.17, 0.035, 0.03, 0.008, 0xd98a3a, 0);
      s.box(bx + 0.04, 0.9, d - 0.175, bx + 0.09, 0.98, d - 0.165, palette.mustard);
    }
    festoon(s, [x0 + 0.05, 0.62, z1 + 0.05], [sx, 1.0, d - 0.2], 7, anchors.lights!);
    festoon(s, [x1 - 0.05, 0.62, z1 + 0.05], [sx, 1.0, d - 0.2], 7, anchors.lights!);
    for (let i = 0; i < 3; i++)
      barrel(
        s,
        (doorU < w / 2 ? x1 - 0.12 : x0 + 0.12) - (doorU < w / 2 ? i * 0.15 : -i * 0.15),
        0,
        z1 + 0.14,
        rnd,
        0.9,
      );
    barrel(s, doorU < w / 2 ? x1 - 0.2 : x0 + 0.2, 0.16, z1 + 0.14, rnd, 0.85);
    flowerPot(s, doorU - 0.3, 0, z1 + 0.14, rnd);
    flowerPot(s, doorU + 0.3, 0, z1 + 0.14, rnd);
  }
  if (c.chimney ?? true) {
    anchors.smoke!.push(
      chimneyPart(s, x0 + 0.25, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.16, palette.brick, true),
    );
    anchors.smoke!.push(
      chimneyPart(s, x1 - 0.25, (z0 + z1) / 2, sh.top - 0.1, sh.ridge + 0.16, palette.brick, true),
    );
  }
  pileOf(s, 'cider', level(opts, 'in:cider'), doorU < w / 2 ? w - 0.45 : 0.45, 0, d - 0.25, rnd);
  return { s, anchors };
}

// --- Herbalist ----------------------------------------------------------------------------------

function herbalist(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 63);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.26;
  const x1 = w - 0.26;
  const z0 = 0.3;
  const z1 = d - 0.55;
  const material: RoofMaterial = c.roofMaterial ?? 'thatch';
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.08,
    wallH: 0.72,
    wall: look() < 0.6 ? 'plaster' : 'stone',
    wallColor: c.wall ?? vary(look() < 0.5 ? palette.plasterSage : 0xd8d0b0, rnd, 0.4),
    trim: palette.timber,
    roof: {
      shape: 'halfHip',
      material,
      color: vary(roofColor(c, material, material === 'thatch' ? 0xb5945a : undefined), rnd, 0.6),
      rise: 0.82,
      overhang: 0.22,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  const accent = c.accent ?? 0x6e8a5a;
  doorPart(s, front, doorU, 0.26, 0.56, accent, palette.timber, 'dutch', 0.012);
  if (!plain) {
    // A window of bottles: colored glass catching the light, glowing softly at night.
    const wu = doorU < w / 2 ? x1 - 0.32 : x0 + 0.32;
    windowPart(
      s,
      front,
      wu,
      0.48,
      0.28,
      0.24,
      { frame: palette.white, shutter: null, box: false, flowers: [] },
      rnd,
      anchors.lights,
      0.012,
    );
    const bottles = [0x5fa86a, 0x7a5aa8, 0xc75b52, 0x5f8fb0, 0xd6a73e];
    for (let i = 0; i < 5; i++) {
      const p = facePoint(front, wu - 0.11 + i * 0.055, 0.36, 0.045);
      s.glow(1);
      s.cylinder(p[0], p[2], 0.016, 0.016, 0.36, 0.42 + (i % 2) * 0.03, bottles[i]!, 6);
      s.glow(0);
      s.cylinder(p[0], p[2], 0.006, 0.006, 0.42 + (i % 2) * 0.03, 0.45 + (i % 2) * 0.03, 0x9a6b43, 4);
    }
    faceBox(s, front, wu - 0.17, 0.35, 0.012, wu + 0.17, 0.365, 0.07, palette.white);
    // Bunches of herbs hung under the eaves all along the front.
    const ez = z1 + 0.16;
    beam(s, [x0 - 0.05, 0.86, ez], [x1 + 0.05, 0.86, ez], 0.006, palette.timber);
    const tops = [GOOD_COLORS.herb, GOOD_COLORS.lavender, GOOD_COLORS.chamomile, 0x9fb08a, 0xd9a03a];
    const n = Math.max(4, Math.floor((x1 - x0) / 0.1));
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
      if (Math.abs(x - doorU) < 0.16) continue;
      beam(s, [x, 0.86, ez], [x, 0.8, ez], 0.003, 0xbfa27a);
      s.blob(x, 0.74, ez, 0.022, 0.06, 0.022, vary(tops[i % tops.length]!, rnd, 0.5), 0);
    }
    // Ivy, a cauldron on a tripod by the door, beds of herbs inside a wattle edge.
    ivyPart(s, front, doorU < w / 2 ? x0 - 0.02 : x1 - 0.3, doorU < w / 2 ? x0 + 0.3 : x1 + 0.02, 0.85, rnd);
    const cx = doorU < w / 2 ? doorU + 0.35 : doorU - 0.35;
    const cz = d - 0.3;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      beam(s, [cx + Math.cos(a) * 0.12, 0, cz + Math.sin(a) * 0.12], [cx, 0.32, cz], 0.008, palette.timber);
    }
    s.cylinder(cx, cz, 0.06, 0.08, 0.08, 0.18, IRON, 8);
    s.cylinder(cx, cz, 0.065, 0.065, 0.18, 0.185, 0x6f9a4a, 8);
    s.glow(2);
    s.blob(cx, 0.05, cz, 0.05, 0.03, 0.05, 0xff9a4a, 0);
    s.glow(0);
    anchors.lights!.push([cx, 0.1, cz]);
    flowerBorder(s, [0.15, d - 0.12], [doorU - 0.22, d - 0.12], rnd);
    wattle(s, [0.06, d - 0.06], [doorU - 0.2, d - 0.06], rnd);
    wattle(s, [doorU + 0.2, d - 0.06], [w - 0.06, d - 0.06], rnd);
    hangingSign(
      s,
      front,
      doorU < w / 2 ? doorU + 0.22 : doorU - 0.22,
      0.74,
      vary(palette.paper, rnd, 0.3),
      (ss, ctr) => {
        // A mortar and pestle.
        for (const k of [-1, 1]) {
          ss.blob(ctr[0] + k * 0.02, ctr[1] - 0.03, ctr[2], 0.012, 0.035, 0.05, 0xb9b1a3, 0);
          ss.blob(ctr[0] + k * 0.02, ctr[1] + 0.03, ctr[2] + 0.02, 0.01, 0.05, 0.012, 0x9a6b43, 0);
        }
      },
    );
    // The cat on the step, naturally.
    s.blob(doorU + 0.14, 0.06, z1 + 0.12, 0.05, 0.035, 0.035, 0x3b3229, 0);
    s.blob(doorU + 0.18, 0.09, z1 + 0.12, 0.025, 0.025, 0.025, 0x3b3229, 0);
  }
  if (c.chimney ?? true)
    anchors.smoke!.push(
      chimneyPart(
        s,
        x1 - 0.28,
        (z0 + z1) / 2 - 0.1,
        sh.top - 0.1,
        sh.ridge + 0.18,
        look() < 0.5 ? palette.brick : vary(palette.stone, rnd),
      ),
    );
  pileOf(s, 'herbs', level(opts, 'in:herbs'), w - 0.4, 0, d - 0.25, rnd);
  if (c.sign) signBoard(s, front, doorU, 0.78, 0.4, 0.012, anchors);
  return { s, anchors };
}

// --- Trading Post -------------------------------------------------------------------------------

/** A beam scale hanging from a little gallows, pans and all. */
function beamScale(s: ShapeBuilder, x: number, z: number): void {
  beam(s, [x, 0, z], [x, 0.62, z], 0.018, palette.timber);
  beam(s, [x, 0.6, z], [x + 0.18, 0.6, z], 0.014, palette.timber);
  beam(s, [x + 0.18, 0.6, z], [x + 0.18, 0.52, z], 0.004, IRON);
  beam(s, [x + 0.04, 0.52, z], [x + 0.32, 0.52, z], 0.008, IRON);
  for (const dx of [0.06, 0.3]) {
    beam(s, [x + dx, 0.52, z], [x + dx, 0.4, z], 0.002, IRON);
    s.cylinder(x + dx, z, 0.05, 0.04, 0.38, 0.4, 0xb08a3a, 8);
  }
}

/** A flagpole with a pennant in two colors. */
function pennant(
  s: ShapeBuilder,
  x: number,
  z: number,
  h: number,
  a: number,
  b: number,
  rnd: () => number,
): void {
  beam(s, [x, 0, z], [x, h, z], 0.012, palette.white);
  s.blob(x, h + 0.01, z, 0.018, 0.018, 0.018, palette.mustard, 0);
  panel(
    s,
    [x, h - 0.02, z],
    [x + 0.3, h - 0.08, z + 0.02],
    [x + 0.3, h - 0.1, z + 0.02],
    [x, h - 0.16, z],
    a,
    vary(a, rnd, 1.2),
  );
  panel(
    s,
    [x, h - 0.09, z + 0.001],
    [x + 0.2, h - 0.09, z + 0.021],
    [x + 0.2, h - 0.11, z + 0.021],
    [x, h - 0.16, z + 0.001],
    b,
    vary(b, rnd, 1.2),
  );
}

function tradingPost(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [3, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 64);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.2;
  const z1 = d - 1.0;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'shingle' : 'slate');
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.12,
    wallH: 1.2,
    wall: 'weatherboard',
    wallColor: c.wall ?? vary(look() < 0.5 ? 0x9a6b43 : 0x7d8fa0, rnd, 0.4),
    trim: palette.white,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.7,
      overhang: 0.16,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = Math.min(Math.max(ex + 0.5, x0 + 0.5), x1 - 0.5);
  const accent = c.accent ?? palette.mustard;
  doorPart(s, front, doorU, 0.5, 0.68, accent, palette.white, 'double', 0.02);
  // A false front: a square-topped board rising over the eaves to carry the name.
  const cu = (x0 + x1) / 2;
  s.box(
    cu - 0.62,
    sh.top - 0.1,
    z1 + 0.02,
    cu + 0.62,
    sh.top + 0.42,
    z1 + 0.08,
    vary(c.wall ?? 0x9a6b43, rnd, 0.5),
  );
  s.box(cu - 0.66, sh.top + 0.42, z1 + 0.0, cu + 0.66, sh.top + 0.47, z1 + 0.11, palette.white);
  s.box(cu - 0.5, sh.top - 0.02, z1 + 0.08, cu + 0.5, sh.top + 0.32, z1 + 0.09, palette.paper);
  if (c.sign)
    anchors.sign = { center: [cu, sh.top + 0.15, z1 + 0.095], normal: [0, 0, 1], width: 0.9, height: 0.28 };
  else {
    // Crossed arrows to the neighbors, painted on the board.
    beam(
      s,
      [cu - 0.35, sh.top + 0.05, z1 + 0.095],
      [cu + 0.35, sh.top + 0.25, z1 + 0.095],
      0.012,
      palette.navy,
    );
    beam(
      s,
      [cu - 0.35, sh.top + 0.25, z1 + 0.095],
      [cu + 0.35, sh.top + 0.05, z1 + 0.095],
      0.012,
      palette.accentRed,
    );
    s.cylinder(cu + 0.36, z1 + 0.095, 0.035, 0, sh.top + 0.25, sh.top + 0.25, palette.navy, 3);
  }
  // The veranda: posts, a lean roof, a boardwalk, and the post's business piled under it.
  const vz = d - 0.35;
  s.box(x0 - 0.05, 0, z1, x1 + 0.05, 0.08, vz + 0.04, vary(palette.wood, rnd, 0.5));
  const posts = Math.max(3, Math.round((x1 - x0) / 0.7) + 1);
  for (let i = 0; i < posts; i++) {
    const x = x0 + ((x1 - x0) * i) / (posts - 1);
    beam(s, [x, 0.08, vz], [x, 0.84, vz], 0.022, palette.white);
  }
  roofPart(s, {
    shape: 'lean',
    material,
    x0: x0 - 0.1,
    z0: z1 - 0.02,
    x1: x1 + 0.1,
    z1: vz + 0.14,
    y0: 0.82,
    y1: 1.02,
    color: vary(sh.roof.color, rnd, 0.3),
    trim: palette.white,
    ridgeAlongX: true,
    rnd,
  });
  if (!plain) {
    const style = windowStyle(c, accent, { box: false, shutters: true });
    windowRow(s, front, x0, x1, 0.55, style, rnd, anchors.lights!, [doorU], 0.6, [0.22, 0.26], 0.02);
    for (const f of [
      { dir: 'x+', plane: x1 },
      { dir: 'x-', plane: x0 },
    ] as Face[])
      windowRow(s, f, z0, z1, 0.6, style, rnd, anchors.lights!, [], 0.8, [0.2, 0.24], 0.02);
    // Goods under the veranda from the post's store, a scale, sacks and barrels.
    const store = ['wool', 'cloth', 'tools', 'cheese', 'cider', 'bricks', 'planks', 'wheat'];
    let placed = 0;
    for (const g of store) {
      const lv = level(opts, `stock:${g}`);
      if (lv <= 0 || placed >= 2) continue;
      pileOf(s, g, Math.min(2, lv), placed === 0 ? x0 + 0.42 : x1 - 0.42, 0.08, (z1 + vz) / 2, rnd);
      placed++;
    }
    for (let i = placed; i < 2; i++) {
      const x = i === 0 ? x0 + 0.35 : x1 - 0.35;
      crateOf(s, '', x - 0.12, 0.08, (z1 + vz) / 2, rnd);
      crateOf(s, '', x + 0.12, 0.08, (z1 + vz) / 2, rnd);
      crateOf(s, '', x, 0.2, (z1 + vz) / 2, rnd);
    }
    beamScale(s, doorU + (doorU < w / 2 ? 0.45 : -0.75), vz - 0.12);
    barrel(s, x1 - 0.1, 0.08, vz - 0.1, rnd);
    // A hitching rail, the neighbors' pennants, a wall lantern by the door.
    beam(s, [x0 + 0.1, 0.24, d - 0.12], [doorU - 0.3, 0.24, d - 0.12], 0.014, palette.timber);
    for (const x of [x0 + 0.1, doorU - 0.3])
      beam(s, [x, 0, d - 0.12], [x, 0.26, d - 0.12], 0.016, palette.timber);
    pennant(s, x0 + 0.02, d - 0.15, 1.35, 0x6e8a5a, palette.mustard, rnd);
    pennant(s, x1 - 0.02, d - 0.15, 1.35, 0x8f969c, palette.accentRed, rnd);
    for (const u of [doorU - 0.38, doorU + 0.38])
      anchors.lights!.push(wallLantern(s, facePoint(front, u, 0.72, 0.02), [0, 0, 1]));
    cylX(s, x1 + 0.03, x1 + 0.07, 0.17, z0 + 0.4, 0.16, palette.darkWood, 10);
  }
  if (c.chimney ?? true)
    anchors.smoke!.push(chimneyPart(s, x0 + 0.3, z0 + 0.35, sh.top - 0.1, sh.ridge + 0.05, palette.brick));
  return { s, anchors };
}

// --- Cart shed ----------------------------------------------------------------------------------

function cartShed(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 65);
  const c = customOf(opts);
  const { s, anchors } = start();
  const plain = opts?.lod === 'low';
  const x0 = 0.16;
  const x1 = w - 0.16;
  const z0 = 0.16;
  const z1 = d - 0.3;
  const material: RoofMaterial = c.roofMaterial ?? (look() < 0.5 ? 'tile' : 'shingle');
  const wallColor = c.wall ?? vary(look() < 0.5 ? 0xa8473b : 0x8a6f58, rnd, 0.4);
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.05,
    wallH: 0.98,
    wall: 'weatherboard',
    wallColor,
    trim: palette.white,
    roof: {
      shape: 'gable',
      material,
      color: vary(roofColor(c, material), rnd, 0.5),
      rise: 0.72,
      overhang: 0.16,
      ridgeAlongX: false,
    },
    rnd,
    plain,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  // The bay: a wide dark opening under a cambered head, straw on the floor, harness on pegs.
  const bw = Math.min(0.9, x1 - x0 - 0.5);
  const bu = Math.min(Math.max(doorU, x0 + bw / 2 + 0.06), x1 - bw / 2 - 0.06);
  faceBox(s, front, bu - bw / 2 - 0.05, 0, 0.0, bu + bw / 2 + 0.05, 0.8, 0.03, palette.white);
  faceBox(s, front, bu - bw / 2, 0.02, 0.03, bu + bw / 2, 0.74, 0.035, 0x2a231d);
  s.box(bu - bw / 2, 0.02, z1 - 0.6, bu + bw / 2, 0.03, z1 + 0.02, 0xd9b96a);
  // The loft door with hay showing, and a hoist beam.
  faceBox(s, front, bu - 0.16, sh.top + 0.05, 0.0, bu + 0.16, sh.top + 0.33, 0.03, palette.white);
  faceBox(s, front, bu - 0.13, sh.top + 0.07, 0.03, bu + 0.13, sh.top + 0.3, 0.035, 0x2a231d);
  s.blob(bu, sh.top + 0.1, z1 + 0.02, 0.12, 0.06, 0.04, 0xdcbc6a, 1);
  beam(
    s,
    facePoint(front, bu, sh.top + 0.45, -0.1),
    facePoint(front, bu, sh.top + 0.45, 0.32),
    0.022,
    palette.timber,
  );
  if (!plain) {
    // The pony's stall on the side, its head over the half door.
    const sideX = doorU < w / 2 ? x1 : x0;
    const side: Face = { dir: doorU < w / 2 ? 'x+' : 'x-', plane: sideX };
    const su = z1 - 0.45;
    faceBox(s, side, su - 0.18, 0, 0.0, su + 0.18, 0.62, 0.03, palette.white);
    faceBox(s, side, su - 0.15, 0.32, 0.03, su + 0.15, 0.6, 0.035, 0x2a231d);
    faceBox(s, side, su - 0.15, 0.02, 0.03, su + 0.15, 0.32, 0.045, vary(0x6e4a2e, rnd, 0.5));
    const head = facePoint(side, su, 0.44, 0.08);
    const hd = side.dir === 'x+' ? 1 : -1;
    const coat = [0x8a5a3a, 0x5a4636, 0xd9c8a8][Math.floor(look() * 3)]!;
    s.blob(head[0] - hd * 0.03, head[1] - 0.02, head[2], 0.05, 0.07, 0.045, coat, 0);
    s.blob(head[0] + hd * 0.04, head[1] - 0.04, head[2], 0.06, 0.04, 0.04, coat, 0);
    s.blob(head[0] - hd * 0.02, head[1] + 0.06, head[2], 0.04, 0.03, 0.05, 0x3b3229, 0);
    for (const dz of [-0.025, 0.025])
      s.blob(head[0] - hd * 0.04, head[1] + 0.07, head[2] + dz, 0.012, 0.03, 0.01, coat, 0);
    // Harness on pegs, a spare wheel, hay, a bucket and a mounting block.
    for (let i = 0; i < 3; i++) {
      const p = facePoint(front, bu + bw / 2 + 0.16 + (i % 2) * 0.0, 0.62 - i * 0.12, 0.03);
      if (bu + bw / 2 + 0.2 > x1) break;
      s.blob(p[0], p[1], p[2] + 0.01, 0.05, 0.04, 0.01, 0x5a3e2a, 0);
    }
    cylX(s, x0 - 0.06, x0 - 0.02, 0.17, (z0 + z1) / 2, 0.16, palette.darkWood, 10);
    cylX(s, x0 - 0.08, x0 - 0.0, 0.17, (z0 + z1) / 2, 0.04, IRON, 6);
    hayBale(s, doorU < w / 2 ? x1 - 0.1 : x0 + 0.1, 0, z1 + 0.15, true, rnd);
    s.cylinder(bu + bw / 2 + 0.12, z1 + 0.12, 0.05, 0.06, 0, 0.09, vary(palette.wood, rnd, 0.5), 8);
    s.rbox(bu - bw / 2 - 0.3, 0, z1 + 0.06, bu - bw / 2 - 0.1, 0.12, z1 + 0.22, palette.stone, 0.01);
    // A cobbled apron in front of the bay.
    for (let i = 0; i < 14; i++) {
      const x = bu - bw / 2 + rnd() * bw;
      const z = z1 + 0.05 + rnd() * 0.2;
      s.rbox(x - 0.035, 0, z - 0.03, x + 0.035, 0.018, z + 0.03, vary(palette.stone, rnd, 1.2), 0.008);
    }
    anchors.lights!.push(wallLantern(s, facePoint(front, bu + bw / 2 + 0.1, 0.8, 0.03), [0, 0, 1]));
    windowRow(
      s,
      { dir: doorU < w / 2 ? 'x-' : 'x+', plane: doorU < w / 2 ? x0 : x1 },
      z0,
      z1,
      0.55,
      windowStyle(c, palette.white, { box: false, shutters: false }),
      rnd,
      anchors.lights!,
      [],
      0.8,
      [0.16, 0.16],
      0.02,
    );
  }
  weathervane(s, (x0 + x1) / 2, sh.ridge + 0.02, (z0 + z1) / 2);
  if (c.sign) signBoard(s, front, bu, 0.88, 0.5, 0.03, anchors);
  return { s, anchors };
}

export const cartShedKit = villageKit('cart-shed', [2, 3], [1, 2], cartShed);
export const herbalistKit = villageKit('herbalist', [2, 2], [1, 1], herbalist);
export const schoolKit = villageKit('school', [3, 3], [1, 2], school);
export const tavernKit = villageKit('tavern', [3, 3], [1, 2], tavern);
export const tradingPostKit = villageKit('trading-post', [3, 3], [1, 2], tradingPost);
