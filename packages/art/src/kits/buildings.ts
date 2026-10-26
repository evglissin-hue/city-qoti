// Storybook homes and civic buildings from the part library: cottages, houses, the shed, the town
// hall, the well and the windmill. Every building gets its own variety from its seed (roof shape
// and material, wall material, porches, props) and honors the player's customization (wall, roof
// and accent swatches, roof material, window boxes, shutters, chimney, sign) from `opts.params`.
import { seeded, ShapeBuilder, vary, type V3 } from '../geometry';
import { palette, PLASTERS } from '../palette';
import { beam, panel } from '../shapes';
import {
  chimneyPart,
  claddingDepth,
  doorPart,
  dormerPart,
  faceBox,
  facePoint,
  foundationPart,
  porchPart,
  wallsOf,
  windowPart,
  type Face,
  type WallMaterial,
  type WindowStyle,
} from './parts';
import { barrel, bench, flowerPot, wallLantern, weathervane } from './props';
import { gableEnds, roofPart, type RoofMaterial, type RoofShape, type RoofSpec } from './roofs';
import { customOf, FLOWERS, pickWeighted, roofColor, streams, type Custom } from './style';
import type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';

export interface Built {
  s: ShapeBuilder;
  anchors: KitAnchors;
}

export interface ShellSpec {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  base: number;
  wallH: number;
  wall: WallMaterial;
  wallColor: number;
  trim: number;
  /** An upper floor in another material, starting `at` above the base, oversailing by `jetty`. */
  upper?: { at: number; wall: WallMaterial; color: number; jetty: number };
  roof: {
    shape: RoofShape;
    material: RoofMaterial;
    color: number;
    rise: number;
    overhang: number;
    ridgeAlongX: boolean;
  };
  rnd: () => number;
  plain?: boolean;
}

export interface Shell {
  /** Top of the walls and the ridge. */
  top: number;
  ridge: number;
  roof: RoofSpec;
  /** Outline of the top floor (with its jetty). */
  outer: [number, number, number, number];
}

/** Foundation, walls (one or two materials), gable ends and the roof. */
export function shell(s: ShapeBuilder, sp: ShellSpec): Shell {
  const { x0, z0, x1, z1, base, rnd } = sp;
  foundationPart(s, x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, base);
  const top = base + sp.wallH;
  let outer: [number, number, number, number] = [x0, z0, x1, z1];
  let topMaterial = sp.wall;
  let topColor = sp.wallColor;
  if (sp.upper) {
    const yu = base + sp.upper.at;
    wallsOf(s, {
      material: sp.wall,
      x0,
      z0,
      x1,
      z1,
      y0: base,
      y1: yu,
      color: sp.wallColor,
      trim: sp.trim,
      rnd,
      ...(sp.plain ? { plain: true } : {}),
    });
    const j = sp.upper.jetty;
    outer = [x0 - j, z0 - j, x1 + j, z1 + j];
    // The jetty's joist ends and sill beam.
    s.box(outer[0] - 0.02, yu - 0.06, outer[1] - 0.02, outer[2] + 0.02, yu + 0.02, outer[3] + 0.02, sp.trim);
    wallsOf(s, {
      material: sp.upper.wall,
      x0: outer[0],
      z0: outer[1],
      x1: outer[2],
      z1: outer[3],
      y0: yu + 0.02,
      y1: top,
      color: sp.upper.color,
      trim: sp.trim,
      rnd,
      ...(sp.plain ? { plain: true } : {}),
    });
    topMaterial = sp.upper.wall;
    topColor = sp.upper.color;
  } else {
    wallsOf(s, {
      material: sp.wall,
      x0,
      z0,
      x1,
      z1,
      y0: base,
      y1: top,
      color: sp.wallColor,
      trim: sp.trim,
      rnd,
      ...(sp.plain ? { plain: true } : {}),
    });
  }
  const r = sp.roof;
  const ov = r.overhang + (r.material === 'thatch' ? 0.06 : 0);
  // Gable ends overhang only a little (verges); eaves get the full overhang.
  const verge = r.shape === 'hip' ? ov : Math.min(ov, 0.09);
  const ox = r.ridgeAlongX ? verge : ov;
  const oz = r.ridgeAlongX ? ov : verge;
  const ridge = top + r.rise + (r.material === 'thatch' ? 0.08 : 0);
  const roof: RoofSpec = {
    shape: r.shape,
    material: r.material,
    x0: outer[0] - ox,
    z0: outer[1] - oz,
    x1: outer[2] + ox,
    z1: outer[3] + oz,
    y0: top - 0.05 - (r.material === 'thatch' ? 0.04 : 0),
    y1: ridge,
    color: r.color,
    trim: vary(palette.timber, rnd, 0.4),
    ridgeAlongX: r.ridgeAlongX,
    rnd,
    ...(sp.plain ? { plain: true } : {}),
  };
  const gableColor =
    topMaterial === 'stone' || topMaterial === 'brick' || topMaterial === 'log'
      ? topMaterial === 'log'
        ? vary(palette.wood, rnd, 0.6)
        : topColor
      : topColor;
  gableEnds(s, roof, outer[0], outer[1], outer[2], outer[3], top, gableColor);
  if (topMaterial === 'timber' && !sp.plain && roof.shape !== 'hip')
    gableTimbers(s, roof, outer, top, sp.trim);
  roofPart(s, roof);
  return { top, ridge, roof, outer };
}

/** A king post and two struts in each gable end, for timber-framed buildings. */
function gableTimbers(
  s: ShapeBuilder,
  roof: RoofSpec,
  outer: [number, number, number, number],
  top: number,
  trim: number,
): void {
  const along = roof.ridgeAlongX;
  const [x0, z0, x1, z1] = outer;
  const a0 = along ? x0 : z0;
  const a1 = along ? x1 : z1;
  const c0 = along ? z0 : x0;
  const c1 = along ? z1 : x1;
  const cm = (c0 + c1) / 2;
  const peak = roof.shape === 'halfHip' ? top + (roof.y1 - top) * 0.45 : roof.y1 - 0.12;
  for (const ae of [a0, a1]) {
    const o = ae === a0 ? -0.012 : 0.012;
    const P = (c: number, y: number): V3 => (along ? [ae + o, y, c] : [c, y, ae + o]);
    if (roof.shape === 'lean') continue;
    beam(s, P(cm, top), P(cm, peak), 0.02, trim);
    beam(s, P(cm, top + 0.04), P(cm - (cm - c0) * 0.5, top + (peak - top) * 0.45), 0.015, trim);
    beam(s, P(cm, top + 0.04), P(cm + (c1 - cm) * 0.5, top + (peak - top) * 0.45), 0.015, trim);
  }
}

export function windowStyle(
  c: Custom,
  accent: number,
  defaults: { box: boolean; shutters: boolean },
): WindowStyle {
  return {
    frame: palette.white,
    shutter: (c.shutters ?? defaults.shutters) ? accent : null,
    box: c.windowBoxes ?? defaults.box,
    flowers: FLOWERS,
  };
}

/** Windows spaced along a face between u0 and u1 at height y, skipping anything near `avoid`. */
export function windowRow(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  u1: number,
  y: number,
  style: WindowStyle,
  rnd: () => number,
  lights: V3[],
  avoid: number[] = [],
  spacing = 0.62,
  size: [number, number] = [0.2, 0.22],
  o = 0,
): void {
  const len = u1 - u0;
  const n = Math.max(1, Math.floor(len / spacing));
  for (let i = 0; i < n; i++) {
    const u = u0 + (len * (i + 0.5)) / n;
    if (avoid.some((a) => Math.abs(a - u) < 0.36)) continue;
    windowPart(s, f, u, y, size[0], size[1], style, rnd, lights, o);
  }
}

/** A hanging plank sign board for custom sign text, mounted above a door. */
export function signBoard(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y: number,
  w: number,
  o: number,
  anchors: KitAnchors,
): void {
  faceBox(s, f, u - w / 2 - 0.02, y - 0.09, o, u + w / 2 + 0.02, y + 0.09, o + 0.02, palette.timber);
  faceBox(s, f, u - w / 2, y - 0.075, o + 0.02, u + w / 2, y + 0.075, o + 0.03, palette.paper);
  const n =
    f.dir === 'z+' ? [0, 0, 1] : f.dir === 'z-' ? [0, 0, -1] : f.dir === 'x+' ? [1, 0, 0] : [-1, 0, 0];
  anchors.sign = { center: facePoint(f, u, y, o + 0.032), normal: n as V3, width: w, height: 0.15 };
}

// --- Cottage, house, shed --------------------------------------------------------------------------

function cottageOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 2];
  const [ex] = opts?.entrance ?? [Math.floor(w / 2), d - 1];
  const { rnd, look } = streams(opts, 1);
  const c = customOf(opts);
  const plain = opts?.lod === 'low';
  const shape = pickWeighted<RoofShape>(look, [
    ['gable', 4],
    ['halfHip', 4],
    ['hip', 2],
  ]);
  const material =
    c.roofMaterial ??
    pickWeighted<RoofMaterial>(look, [
      ['thatch', 4],
      ['tile', 4],
      ['slate', 2],
    ]);
  const wallMat = pickWeighted<WallMaterial>(look, [
    ['timber', 5],
    ['plaster', 3],
    ['stone', 3],
  ]);
  const plaster = PLASTERS[Math.floor(look() * PLASTERS.length)]!;
  const wallColor = c.wall ?? (wallMat === 'stone' ? vary(palette.stone, rnd, 0.8) : vary(plaster, rnd, 0.5));
  const accentDefault = [palette.teal, palette.accentRed, palette.navy, palette.mustard][
    Math.floor(look() * 4)
  ]!;
  const accent = c.accent ?? accentDefault;
  const porch = look() < 0.4;
  const s = new ShapeBuilder();
  const anchors: KitAnchors = { smoke: [], lights: [] };
  const x0 = 0.22;
  const x1 = w - 0.22;
  const z0 = 0.3;
  const z1 = d - 0.26;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 0.78,
    wall: wallMat,
    wallColor,
    trim: vary(palette.timber, rnd, 0.4),
    roof: {
      shape,
      material,
      color: vary(roofColor(c, material), rnd, 0.6),
      rise: material === 'thatch' ? 0.66 : 0.6,
      overhang: 0.18,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const clad = claddingDepth(wallMat);
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.28, 0.62, accent, palette.timber, 'arched', clad);
  if (porch && !plain)
    porchPart(
      s,
      front,
      doorU,
      0.34,
      0.78,
      0.28,
      vary(roofColor(c, material === 'thatch' ? 'tile' : material), rnd, 0.6),
      palette.timber,
      false,
    );
  if (!plain) {
    const style = windowStyle(c, accent, { box: true, shutters: true });
    windowRow(s, front, x0, x1, 0.52, style, rnd, anchors.lights!, [doorU], 0.6, [0.2, 0.22], clad);
    const side = { ...style, box: false };
    windowPart(s, { dir: 'x+', plane: x1 }, (z0 + z1) / 2, 0.52, 0.18, 0.2, side, rnd, anchors.lights, clad);
    windowPart(s, { dir: 'x-', plane: x0 }, (z0 + z1) / 2, 0.52, 0.18, 0.2, side, rnd, anchors.lights, clad);
    windowPart(s, { dir: 'z-', plane: z0 }, (x0 + x1) / 2, 0.52, 0.2, 0.22, side, rnd, anchors.lights, clad);
    // Doorstep life: pots, a bench or a rain barrel, stepping stones.
    flowerPot(s, doorU + 0.26, 0, z1 + 0.1, rnd);
    if (look() < 0.5) bench(s, x0 + 0.3 < doorU - 0.4 ? x0 + 0.3 : x1 - 0.3, z1 + 0.12, true, rnd);
    else barrel(s, x1 + 0.08, 0, z1 - 0.12, rnd, 0.9);
    for (let i = 0; i < 2; i++)
      s.rbox(
        doorU - 0.09,
        0,
        z1 + 0.18 + i * 0.16,
        doorU + 0.09,
        0.018,
        z1 + 0.3 + i * 0.16,
        vary(palette.stone, rnd, 1.2),
        0.01,
      );
  }
  if (c.chimney ?? true) {
    const cx = look() < 0.5 ? x1 - 0.32 : x0 + 0.32;
    anchors.smoke!.push(
      chimneyPart(
        s,
        cx,
        (z0 + z1) / 2 - 0.18,
        sh.top - 0.1,
        sh.ridge + 0.12,
        wallMat === 'stone' ? vary(palette.stone, rnd) : palette.brick,
      ),
    );
  }
  if (c.sign) signBoard(s, front, doorU, 0.86, 0.46, clad, anchors);
  return { s, anchors };
}

function houseOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [2, 3];
  const [ex] = opts?.entrance ?? [1, d - 1];
  const { rnd, look } = streams(opts, 2);
  const c = customOf(opts);
  const plain = opts?.lod === 'low';
  const material =
    c.roofMaterial ??
    pickWeighted<RoofMaterial>(look, [
      ['slate', 4],
      ['tile', 4],
      ['shingle', 1],
    ]);
  const lower = pickWeighted<WallMaterial>(look, [
    ['stone', 4],
    ['brick', 3],
    ['plaster', 3],
  ]);
  const plaster = PLASTERS[Math.floor(look() * PLASTERS.length)]!;
  const upperColor = c.wall ?? vary(plaster, rnd, 0.5);
  const lowerColor =
    lower === 'stone'
      ? vary(palette.stone, rnd, 0.8)
      : lower === 'brick'
        ? vary(palette.brick, rnd, 0.6)
        : upperColor;
  const accent = c.accent ?? [palette.accentRed, palette.navy, palette.teal][Math.floor(look() * 3)]!;
  const gableFront = look() < 0.6;
  const s = new ShapeBuilder();
  const anchors: KitAnchors = { smoke: [], lights: [] };
  const x0 = 0.2;
  const x1 = w - 0.2;
  const z0 = 0.25;
  const z1 = d - 0.3;
  const jetty = 0.08;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.1,
    wallH: 1.36,
    wall: lower,
    wallColor: lowerColor,
    trim: vary(palette.timber, rnd, 0.4),
    upper: { at: 0.66, wall: 'timber', color: upperColor, jetty },
    roof: {
      shape: gableFront ? 'gable' : 'halfHip',
      material,
      color: vary(roofColor(c, material), rnd, 0.6),
      rise: gableFront ? 0.85 : 0.7,
      overhang: 0.16,
      ridgeAlongX: !gableFront,
    },
    rnd,
    plain,
  });
  const [ox0, oz0, ox1, oz1] = sh.outer;
  const clad = claddingDepth(lower);
  const front: Face = { dir: 'z+', plane: z1 };
  const upFront: Face = { dir: 'z+', plane: oz1 };
  const doorU = ex + 0.5;
  doorPart(s, front, doorU, 0.28, 0.6, accent, palette.timber, look() < 0.5 ? 'arched' : 'dutch', clad);
  if (!plain) {
    const style = windowStyle(c, accent, { box: true, shutters: true });
    windowRow(s, front, x0, x1, 0.45, style, rnd, anchors.lights!, [doorU], 0.6, [0.2, 0.22], clad);
    windowRow(s, upFront, ox0, ox1, 1.12, style, rnd, anchors.lights!, [], 0.6, [0.22, 0.24], 0.012);
    const side = { ...style, box: false };
    for (const f of [
      { dir: 'x+', plane: ox1 },
      { dir: 'x-', plane: ox0 },
    ] as Face[]) {
      windowRow(s, f, oz0, oz1, 1.12, side, rnd, anchors.lights!, [], 0.9, [0.18, 0.2], 0.012);
      windowRow(
        s,
        { dir: f.dir, plane: f.dir === 'x+' ? x1 : x0 },
        z0,
        z1,
        0.45,
        side,
        rnd,
        anchors.lights!,
        [],
        1.1,
        [0.18, 0.2],
        clad,
      );
    }
    if (gableFront) {
      // A small round window up in the gable.
      windowPart(
        s,
        upFront,
        (ox0 + ox1) / 2,
        sh.top + 0.3,
        0.12,
        0.12,
        { frame: palette.white, shutter: null, box: false, flowers: [] },
        rnd,
        anchors.lights,
        0.01,
      );
      if (look() < 0.7) {
        const dz = (oz0 + oz1) / 2;
        dormerPart(
          s,
          { dir: 'x+', plane: (ox0 + ox1) / 2 + 0.38 },
          dz,
          sh.top + 0.04,
          0.3,
          upperColor,
          sh.roof.color,
          palette.timber,
          rnd,
          anchors.lights,
        );
      }
    } else {
      dormerPart(
        s,
        { dir: 'z+', plane: (oz0 + oz1) / 2 + 0.5 },
        (ox0 + ox1) / 2,
        sh.top + 0.02,
        0.3,
        upperColor,
        sh.roof.color,
        palette.timber,
        rnd,
        anchors.lights,
      );
    }
    porchPart(s, front, doorU, 0.32, 0.72, 0.24, vary(sh.roof.color, rnd, 0.5), palette.timber, false);
    flowerPot(s, doorU - 0.26, 0, z1 + 0.1, rnd);
    flowerPot(s, doorU + 0.26, 0, z1 + 0.1, rnd);
  }
  if (c.chimney ?? true) {
    const cx = gableFront ? x1 - 0.22 : x1 - 0.3;
    const cz = gableFront ? (z0 + z1) / 2 : (z0 + z1) / 2 - 0.2;
    anchors.smoke!.push(chimneyPart(s, cx, cz, sh.top - 0.1, sh.ridge + 0.1, palette.brick));
  }
  if (c.sign) signBoard(s, front, doorU, 0.78, 0.44, clad, anchors);
  return { s, anchors };
}

function shedOf(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [1, 2];
  const { rnd, look } = streams(opts, 3);
  const c = customOf(opts);
  const s = new ShapeBuilder();
  const anchors: KitAnchors = { smoke: [], lights: [] };
  const x0 = 0.14;
  const x1 = w - 0.14;
  const z0 = 0.18;
  const z1 = d - 0.18;
  const board = c.wall ?? [0x7d9a84, 0x9a6b43, 0x8a6f58, 0x6e8aa0][Math.floor(look() * 4)]!;
  const material = c.roofMaterial ?? 'shingle';
  shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.06,
    wallH: 0.62,
    wall: 'weatherboard',
    wallColor: vary(board, rnd, 0.5),
    trim: palette.white,
    roof: {
      shape: 'lean',
      material,
      color: vary(roofColor(c, material), rnd, 0.6),
      rise: 0.26,
      overhang: 0.12,
      ridgeAlongX: false,
    },
    rnd,
  });
  const front: Face = { dir: 'z+', plane: z1 };
  doorPart(s, front, w / 2, 0.36, 0.52, c.accent ?? palette.mustard, palette.white, 'double', 0.02);
  windowPart(
    s,
    { dir: 'x+', plane: x1 },
    d / 2 - 0.2,
    0.42,
    0.16,
    0.16,
    windowStyle(c, palette.white, { box: false, shutters: false }),
    rnd,
    anchors.lights,
    0.02,
  );
  barrel(s, x1 + 0.06, 0, z1 - 0.1, rnd, 0.8);
  if (c.sign) signBoard(s, front, w / 2, 0.66, 0.36, 0.02, anchors);
  return { s, anchors };
}

function houseKit(id: string, make: (o: KitBuildOptions | undefined) => Built): Kit {
  return {
    id,
    kind: 'building',
    build: (opts) => make(opts).s.build(),
    anchors: (opts) => make(opts).anchors,
  };
}

export const cottage = houseKit('cottage', cottageOf);
export const house2 = houseKit('house', houseOf);
export const shed = houseKit('shed', shedOf);

// --- Town hall --------------------------------------------------------------------------------------

function hall(opts: KitBuildOptions | undefined): Built {
  const [w, d] = opts?.size ?? [4, 4];
  const [ex] = opts?.entrance ?? [2, 3];
  const { rnd } = streams(opts, 4);
  const c = customOf(opts);
  const plain = opts?.lod === 'low';
  const s = new ShapeBuilder();
  const anchors: KitAnchors = { smoke: [], lights: [] };
  const x0 = 0.3;
  const x1 = w - 0.3;
  const z0 = 0.35;
  const z1 = d - 0.55;
  const material = c.roofMaterial ?? 'slate';
  const accent = c.accent ?? palette.navy;
  const upperColor = c.wall ?? palette.plasterSage;
  const sh = shell(s, {
    x0,
    z0,
    x1,
    z1,
    base: 0.16,
    wallH: 1.55,
    wall: 'stone',
    wallColor: vary(palette.stone, rnd, 0.6),
    trim: palette.timber,
    upper: { at: 0.8, wall: 'timber', color: upperColor, jetty: 0.05 },
    roof: {
      shape: 'hip',
      material,
      color: c.roof ?? roofColor(c, material, palette.roofPlum),
      rise: 1.0,
      overhang: 0.2,
      ridgeAlongX: true,
    },
    rnd,
    plain,
  });
  const [ox0, , ox1, oz1] = sh.outer;
  const front: Face = { dir: 'z+', plane: z1 };
  const doorU = ex;
  // Steps up to a columned porch with a pediment.
  for (let i = 0; i < 3; i++)
    s.rbox(
      doorU - 0.55 + i * 0.05,
      0,
      z1 + 0.42 - i * 0.12,
      doorU + 0.55 - i * 0.05,
      0.055 * (i + 1),
      z1 + 0.54 - i * 0.12 + (i === 2 ? 0.12 : 0),
      vary(palette.stone, rnd, 0.6),
      0.01,
    );
  doorPart(s, front, doorU, 0.42, 0.72, accent, palette.white, 'double', 0.015);
  if (!plain) {
    for (const du of [-0.45, 0.45]) {
      s.cylinder(doorU + du, z1 + 0.36, 0.05, 0.045, 0.16, 0.95, palette.white, 8);
      s.box(doorU + du - 0.07, 0.95, z1 + 0.29, doorU + du + 0.07, 0.99, z1 + 0.43, palette.white);
    }
    s.box(doorU - 0.58, 0.99, z1, doorU + 0.58, 1.06, z1 + 0.46, palette.white);
    s.gable(doorU - 0.6, z1, doorU + 0.6, z1 + 0.48, 1.06, 1.32, vary(sh.roof.color, rnd, 0.4), false);
    s.tri(
      [doorU - 0.52, 1.07, z1 + 0.485],
      [doorU + 0.52, 1.07, z1 + 0.485],
      [doorU, 1.29, z1 + 0.485],
      palette.white,
      [0, 0, 1],
    );
    const style = windowStyle(c, accent, { box: true, shutters: true });
    windowRow(
      s,
      front,
      x0,
      x1,
      0.55,
      { ...style, arch: true },
      rnd,
      anchors.lights!,
      [doorU - 0.4, doorU + 0.4],
      0.62,
      [0.22, 0.24],
      0.015,
    );
    windowRow(
      s,
      { dir: 'z+', plane: oz1 },
      ox0,
      ox1,
      1.32,
      style,
      rnd,
      anchors.lights!,
      [],
      0.62,
      [0.22, 0.24],
      0.012,
    );
    for (const f of [
      { dir: 'x+', plane: x1 },
      { dir: 'x-', plane: x0 },
    ] as Face[]) {
      windowRow(
        s,
        f,
        z0,
        z1,
        0.55,
        { ...style, box: false, arch: true },
        rnd,
        anchors.lights!,
        [],
        0.9,
        [0.2, 0.22],
        0.015,
      );
      windowRow(
        s,
        { dir: f.dir, plane: f.dir === 'x+' ? ox1 : ox0 },
        z0,
        z1,
        1.32,
        { ...style, box: false },
        rnd,
        anchors.lights!,
        [],
        0.9,
        [0.2, 0.22],
        0.012,
      );
    }
    // The Charter board: a little roofed notice board with pinned notes.
    const bx = doorU + 1.0;
    const bz = z1 + 0.32;
    for (const dx of [-0.18, 0.18]) beam(s, [bx + dx, 0, bz], [bx + dx, 0.62, bz], 0.018, palette.timber);
    s.box(bx - 0.2, 0.3, bz - 0.02, bx + 0.2, 0.58, bz + 0.02, vary(palette.wood, rnd, 0.5));
    for (const [nx, ny, col] of [
      [-0.1, 0.5, palette.paper],
      [0.06, 0.48, palette.white],
      [-0.06, 0.38, palette.plasterButter],
      [0.11, 0.37, palette.paper],
    ] as const)
      s.box(bx + nx - 0.045, ny - 0.04, bz + 0.02, bx + nx + 0.045, ny + 0.04, bz + 0.026, col);
    s.gable(bx - 0.25, bz - 0.08, bx + 0.25, bz + 0.1, 0.62, 0.72, palette.roofPlum, true);
    // Lanterns either side of the door, planters on the steps.
    anchors.lights!.push(wallLantern(s, facePoint(front, doorU - 0.62, 0.72, 0.015), [0, 0, 1]));
    anchors.lights!.push(wallLantern(s, facePoint(front, doorU + 0.62, 0.72, 0.015), [0, 0, 1]));
    flowerPot(s, doorU - 0.65, 0, z1 + 0.55, rnd, palette.flowerA);
    flowerPot(s, doorU + 0.65, 0, z1 + 0.55, rnd, palette.flowerB);
    // A flag on a pole at the front corner.
    const fx = x0 - 0.05;
    const fz = z1 + 0.35;
    beam(s, [fx, 0, fz], [fx, 1.9, fz], 0.016, palette.white);
    s.blob(fx, 1.92, fz, 0.025, 0.025, 0.025, palette.mustard, 0);
    panel(
      s,
      [fx + 0.02, 1.85, fz],
      [fx + 0.36, 1.78, fz + 0.02],
      [fx + 0.36, 1.66, fz + 0.02],
      [fx + 0.02, 1.6, fz],
      palette.accentRed,
      vary(palette.accentRed, rnd, 1.5),
    );
    bench(s, doorU - 1.05, z1 + 0.4, true, rnd);
  }
  // The clock tower on the ridge, with an open belfry and a pyramid roof.
  const cx = w / 2;
  const cz = (z0 + z1) / 2;
  // The tower rises from the ridge so its clock face clears the roof.
  const ty = sh.ridge - 0.28;
  const tw = 0.3;
  s.rbox(cx - tw, sh.top + 0.2, cz - tw, cx + tw, ty + 0.95, cz + tw, palette.plasterCream, 0.02);
  s.box(
    cx - tw - 0.025,
    ty + 0.28,
    cz - tw - 0.025,
    cx + tw + 0.025,
    ty + 0.33,
    cz + tw + 0.025,
    palette.timber,
  );
  s.box(cx - tw - 0.03, ty + 0.92, cz - tw - 0.03, cx + tw + 0.03, ty + 0.99, cz + tw + 0.03, palette.timber);
  // Belfry posts and the bell.
  for (const [px, pz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const)
    s.box(
      cx + px * tw - 0.035,
      ty + 0.99,
      cz + pz * tw - 0.035,
      cx + px * tw + 0.035,
      ty + 1.32,
      cz + pz * tw + 0.035,
      palette.white,
    );
  s.cylinder(cx, cz, 0.04, 0.11, ty + 1.05, ty + 1.24, palette.mustard, 8);
  s.box(cx - tw - 0.05, ty + 1.32, cz - tw - 0.05, cx + tw + 0.05, ty + 1.38, cz + tw + 0.05, palette.timber);
  s.cylinder(cx, cz, 0.5, 0, ty + 1.38, ty + 1.95, c.roof ?? palette.roofPlum, 4, Math.PI / 4);
  weathervane(s, cx, ty + 1.94, cz);
  // Clock face: always lit at night.
  const face = cz + tw + 0.012;
  s.glow(2);
  s.cylinder(cx, face, 0.17, 0.17, ty + 0.62, ty + 0.62, palette.white, 10);
  s.box(cx - 0.16, ty + 0.47, face, cx + 0.16, ty + 0.77, face + 0.012, 0xfaf3df);
  s.glow(0);
  s.box(cx - 0.18, ty + 0.45, face - 0.004, cx + 0.18, ty + 0.79, face + 0.008, palette.timber);
  s.box(cx - 0.008, ty + 0.62, face + 0.012, cx + 0.008, ty + 0.75, face + 0.018, palette.ink);
  s.box(cx - 0.008, ty + 0.555, face + 0.012, cx + 0.09, ty + 0.62, face + 0.018, palette.ink);
  anchors.lights!.push([cx, ty + 0.62, face + 0.05]);
  if (c.chimney ?? true)
    anchors.smoke!.push(chimneyPart(s, x1 - 0.5, z0 + 0.5, sh.top - 0.1, sh.ridge - 0.1, palette.brick));
  if (c.sign) signBoard(s, front, doorU, 1.18, 0.6, 0.05, anchors);
  return { s, anchors };
}

export const townHall: Kit = {
  id: 'town-hall',
  kind: 'building',
  build: (opts) => hall(opts).s.build(),
  anchors: (opts) => hall(opts).anchors,
};

// --- Well --------------------------------------------------------------------------------------------

export const well: Kit = {
  id: 'well',
  kind: 'building',
  build: (opts) => {
    const rnd = seeded(opts?.seed ?? 1);
    const s = new ShapeBuilder();
    // A ring of chunky stones, a winch on two posts with a bucket, under a little tiled roof.
    const n = 10;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n; i++) {
        const a0 = ((i + row * 0.5) / n) * Math.PI * 2;
        const a1 = ((i + row * 0.5 + 1) / n) * Math.PI * 2;
        const r0 = 0.24;
        const r1 = 0.33;
        const y0 = row * 0.12;
        const y1 = y0 + 0.115;
        const p = (a: number, r: number, y: number): V3 => [0.5 + Math.cos(a) * r, y, 0.5 + Math.sin(a) * r];
        const hex = vary(palette.stone, rnd, 1.6);
        const am = (a0 + a1) / 2;
        s.quad(p(a0 + 0.02, r1, y0), p(a1 - 0.02, r1, y0), p(a1 - 0.02, r1, y1), p(a0 + 0.02, r1, y1), hex, [
          Math.cos(am),
          0,
          Math.sin(am),
        ]);
        s.quad(
          p(a0 + 0.02, r0, y1),
          p(a1 - 0.02, r0, y1),
          p(a1 - 0.02, r1, y1),
          p(a0 + 0.02, r1, y1),
          vary(hex, rnd, 0.5),
          [0, 1, 0],
        );
        s.quad(
          p(a0 + 0.02, r0, y0),
          p(a1 - 0.02, r0, y0),
          p(a1 - 0.02, r0, y1),
          p(a0 + 0.02, r0, y1),
          vary(hex, rnd, 0.5),
          [-Math.cos(am), 0, -Math.sin(am)],
        );
      }
    }
    s.cylinder(0.5, 0.5, 0.25, 0.25, 0.0, 0.3, palette.foundation, 10);
    s.cylinder(0.5, 0.5, 0.24, 0.24, 0.3, 0.305, palette.waterDeep, 10);
    s.rbox(0.13, 0.0, 0.46, 0.2, 0.9, 0.54, palette.timber, 0.01);
    s.rbox(0.8, 0.0, 0.46, 0.87, 0.9, 0.54, palette.timber, 0.01);
    s.box(0.2, 0.66, 0.485, 0.8, 0.7, 0.515, palette.wood);
    s.box(0.87, 0.64, 0.495, 0.93, 0.67, 0.505, palette.metal);
    s.box(0.92, 0.58, 0.495, 0.94, 0.67, 0.505, palette.metal);
    beam(s, [0.5, 0.66, 0.5], [0.5, 0.48, 0.5], 0.004, 0xbfa27a);
    s.cylinder(0.5, 0.5, 0.05, 0.06, 0.4, 0.48, vary(palette.wood, rnd, 0.5), 8);
    s.box(0.44, 0.475, 0.495, 0.56, 0.485, 0.505, palette.metal);
    const roof: RoofSpec = {
      shape: 'gable',
      material: 'tile',
      x0: 0.04,
      z0: 0.22,
      x1: 0.96,
      z1: 0.78,
      y0: 0.86,
      y1: 1.14,
      color: vary(palette.roofTerracotta, rnd),
      trim: palette.timber,
      ridgeAlongX: true,
      rnd,
    };
    roofPart(s, roof);
    // A bucket waiting on the rim.
    s.cylinder(0.78, 0.74, 0.045, 0.055, 0.36, 0.44, vary(palette.wood, rnd, 0.5), 8);
    return s.build();
  },
};

// --- Windmill -----------------------------------------------------------------------------------------

const MILL_SPIN = 0.6;

function millSize(opts: KitBuildOptions | undefined): [number, number] {
  return opts?.size ?? [2, 2];
}

function hubOf(opts: KitBuildOptions | undefined): V3 {
  const [w, d] = millSize(opts);
  return [w / 2, 2.15, d / 2 + 0.66];
}

function mill(opts: KitBuildOptions | undefined): Built {
  const [w, d] = millSize(opts);
  const { rnd } = streams(opts, 5);
  const c = customOf(opts);
  const cx = w / 2;
  const cz = d / 2;
  const s = new ShapeBuilder();
  const anchors: KitAnchors = { smoke: [], lights: [] };
  // A stone base, then a tapering white tower in timber bands, a reefing stage and a boat cap.
  s.cylinder(cx, cz, 0.84, 0.8, 0, 0.42, vary(palette.stone, rnd, 0.6), 8, Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + 0.2;
    const x = cx + Math.cos(a) * 0.83;
    const z = cz + Math.sin(a) * 0.83;
    s.box(
      x - 0.07,
      0.12 + (i % 3) * 0.08,
      z - 0.07,
      x + 0.07,
      0.2 + (i % 3) * 0.08,
      z + 0.07,
      vary(palette.stone, rnd, 1.6),
    );
  }
  const wall = c.wall ?? palette.plasterCream;
  s.cylinder(cx, cz, 0.74, 0.52, 0.42, 2.3, vary(wall, rnd, 0.4), 8, Math.PI / 8);
  for (const y of [1.0, 1.7]) {
    const r = 0.74 - ((y - 0.42) / (2.3 - 0.42)) * 0.22;
    s.cylinder(cx, cz, r + 0.02, r + 0.015, y, y + 0.06, palette.timber, 8, Math.PI / 8);
  }
  // The reefing stage: a ring of planks on brackets with a railing.
  const stageY = 1.26;
  const rIn = 0.64;
  const rOut = 0.98;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 1) / 12) * Math.PI * 2;
    const p = (a: number, r: number, y: number): V3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    s.quad(
      p(a0, rIn, stageY),
      p(a1, rIn, stageY),
      p(a1, rOut, stageY),
      p(a0, rOut, stageY),
      vary(palette.wood, rnd, 0.6),
      [0, 1, 0],
    );
    s.quad(
      p(a0, rIn, stageY - 0.04),
      p(a1, rIn, stageY - 0.04),
      p(a1, rOut, stageY - 0.04),
      p(a0, rOut, stageY - 0.04),
      palette.darkWood,
      [0, -1, 0],
    );
    s.quad(
      p(a0, rOut, stageY - 0.04),
      p(a1, rOut, stageY - 0.04),
      p(a1, rOut, stageY),
      p(a0, rOut, stageY),
      palette.darkWood,
      [Math.cos(a0), 0, Math.sin(a0)],
    );
    beam(s, p(a0, rOut - 0.02, stageY), p(a0, rOut - 0.02, stageY + 0.22), 0.01, palette.timber);
    beam(s, p(a0, rOut - 0.02, stageY + 0.22), p(a1, rOut - 0.02, stageY + 0.22), 0.009, palette.timber);
    if (i % 3 === 0)
      beam(s, p(a0, 0.68, stageY - 0.3), p(a0, rOut - 0.05, stageY - 0.04), 0.015, palette.timber);
  }
  // Boat-shaped cap.
  const capMaterial = c.roofMaterial ?? 'shingle';
  const capColor = vary(roofColor(c, capMaterial, palette.roofSlate), rnd, 0.6);
  s.cylinder(cx, cz, 0.58, 0.58, 2.28, 2.36, palette.timber, 8, Math.PI / 8);
  const cap: RoofSpec = {
    shape: 'gable',
    material: capMaterial,
    x0: cx - 0.62,
    z0: cz - 0.7,
    x1: cx + 0.62,
    z1: cz + 0.7,
    y0: 2.36,
    y1: 2.92,
    color: capColor,
    trim: palette.timber,
    ridgeAlongX: false,
    rnd,
  };
  roofPart(s, cap);
  gableEnds(s, cap, cx - 0.56, cz - 0.62, cx + 0.56, cz + 0.62, 2.36, vary(palette.wood, rnd, 0.5));
  s.blob(cx, 2.98, cz - 0.62, 0.05, 0.05, 0.05, palette.mustard, 0);
  // Hub housing (the sails are a separate spinning part).
  const [hx, hy, hz] = hubOf(opts);
  s.box(hx - 0.1, hy - 0.1, hz - 0.24, hx + 0.1, hy + 0.1, hz, palette.timber);
  const face: Face = { dir: 'z+', plane: cz + 0.72 };
  doorPart(s, face, cx, 0.28, 0.66, c.accent ?? palette.mustard, palette.timber, 'arched', 0.02);
  const style = windowStyle(c, c.accent ?? palette.teal, { box: true, shutters: true });
  windowPart(s, { dir: 'z+', plane: cz + 0.6 }, cx, 1.62, 0.16, 0.2, style, rnd, anchors.lights);
  windowPart(
    s,
    { dir: 'x+', plane: cx + 0.62 },
    cz,
    0.95,
    0.16,
    0.2,
    { ...style, box: false },
    rnd,
    anchors.lights,
  );
  windowPart(
    s,
    { dir: 'x-', plane: cx - 0.62 },
    cz,
    1.95,
    0.14,
    0.18,
    { ...style, box: false, shutter: null },
    rnd,
    anchors.lights,
  );
  // Flour sacks waiting by the door, more when the output buffer fills.
  const sacks = Math.max(
    1,
    Math.min(4, Math.round((opts?.params?.['out:flour'] as number | undefined) ?? 1)),
  );
  for (let i = 0; i < sacks; i++) {
    const sx = cx + 0.42 + (i % 2) * 0.15;
    const sz = cz + 0.72 + Math.floor(i / 2) * 0.16;
    s.blob(sx, 0.07, sz, 0.08, 0.07, 0.065, vary(0xece4d2, rnd, 0.5), 1);
  }
  if (c.sign) signBoard(s, face, cx, 0.95, 0.4, 0.02, anchors);
  return { s, anchors };
}

export const windmill: Kit = {
  id: 'windmill',
  kind: 'building',
  build: (opts) => mill(opts).s.build(),
  anchors: (opts) => mill(opts).anchors,
  parts: (opts): KitPart[] => {
    const [hx, hy, hz] = hubOf(opts);
    const s = new ShapeBuilder();
    // Four lattice sails with half-furled cloth, built around the hub so the pivot is its center.
    s.cylinder(hx, hz + 0.05, 0.09, 0.09, hy - 0.05, hy + 0.05, palette.timber, 6);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const pt = (r: number, t: number, z: number): V3 => [
        hx + cs * r - sn * t,
        hy + sn * r + cs * t,
        hz + z,
      ];
      beam(s, pt(0.05, 0, 0.06), pt(1.3, 0, 0.06), 0.022, palette.timber);
      // Lattice: two rails and cross bars.
      beam(s, pt(0.28, 0.27, 0.05), pt(1.28, 0.3, 0.05), 0.01, palette.wood);
      for (let i = 0; i < 6; i++) {
        const r = 0.3 + i * 0.19;
        beam(s, pt(r, 0.02, 0.05), pt(r, 0.29, 0.05), 0.008, palette.wood);
      }
      // Cloth over the outer two thirds.
      for (const [z, hex, out] of [
        [0.042, palette.white, 1],
        [0.038, palette.paperShade, -1],
      ] as const)
        s.quad(pt(0.5, 0.03, z), pt(1.26, 0.03, z), pt(1.26, 0.28, z), pt(0.5, 0.25, z), hex, [0, 0, out]);
    }
    return [{ geometry: s.build(false), pivot: [hx, hy, hz], spinAxis: [0, 0, 1], spinSpeed: MILL_SPIN }];
  },
};
